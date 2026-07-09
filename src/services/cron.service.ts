
import cron from 'node-cron';
import { CoinsTransaction } from '../models/spentCoinModel';
import { User } from '../models/user.model';
import { CallStatus } from '../constants/user';
import { BillingService } from './billing.service';
import { ChatQueueService } from './chatQueue.service';

/**
 * Chat Persistent Worker (Runs every 1s)
 */
export const startChatWorker = () => {
    setInterval(async () => {
        await ChatQueueService.flushQueue();
    }, 1000); // 1 second interval
};

/**
 * Cleanup Stale Calls Job
 * Checks for:
 * 1. PENDING calls older than 5 minutes (Host never picked up)
 * 2. ONGOING calls with no heartbeat for 2 minutes (Connection lost)
 */
export const startCallCleanupJob = () => {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        console.log('🧹 Running Call Cleanup Janitor...');

        try {
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60000);
            const twoMinutesAgo = new Date(now.getTime() - 2 * 60000);

            // 1. Fix Stuck INITIATED/RINGING Calls
            const stuckPending = await CoinsTransaction.find({
                status: { $in: [CallStatus.INITIATED, CallStatus.RINGING] },
                createdAt: { $lt: fiveMinutesAgo }
            });

            if (stuckPending.length > 0) {
                console.log(`found ${stuckPending.length} stuck pending calls`);
                for (const txn of stuckPending) {
                    txn.status = CallStatus.MISSED;
                    txn.callEnd = now;
                    await txn.save();

                    // Release host
                    await User.findByIdAndUpdate(txn.hostId, { isBusy: false });
                    console.log(`❌ Auto-closed Stuck INITIATED/RINGING: ${txn._id}`);
                }
            }

            // 2. Fix Zombie Calls (No heartbeat in active states)
            const zombies = await CoinsTransaction.find({
                status: { $in: [CallStatus.ACCEPTED, CallStatus.CONNECTING, CallStatus.CONNECTED] },
                $or: [
                    { lastHeartbeat: { $lt: twoMinutesAgo } },
                    {
                        lastHeartbeat: { $exists: false },
                        createdAt: { $lt: twoMinutesAgo }
                    },
                    {
                        lastHeartbeat: null,
                        createdAt: { $lt: twoMinutesAgo }
                    }
                ]
            });

            if (zombies.length > 0) {
                console.log(`found ${zombies.length} zombie calls`);
                for (const txn of zombies) {
                    // Force End
                    console.log(`💀 Auto-ending ZOMBIE Call: ${txn._id} (Last HB: ${txn.lastHeartbeat})`);

                    // We use processCallEnd but with the time of last heartbeat + buffer? 
                    // Or just NOW? If we use NOW, user pays for dead air.
                    // Making them pay for dead air is 'unfair' but motivates proper disconnection.
                    // Better: Pay until lastHeartbeat.

                    const endTime = txn.lastHeartbeat || now;

                    await BillingService.processCallEnd(txn._id as any, endTime);
                }
            }

        } catch (error) {
            console.error('Janitor Error:', error);
        }
    });
};
