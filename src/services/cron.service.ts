
import cron from 'node-cron';
import { CoinsTransaction } from '../models/spentCoinModel';
import { User } from '../models/user.model';
import { CallStatus } from '../constants/user';
import { BillingService } from './billing.service';
import { ChatQueueService } from './chatQueue.service';
import { getIO, getUserRoom } from '../sockets';
import { createNotification } from '../controllers/notificationController';
import { sendMissedCallNotification } from '../utils/pushNotification';

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
    // Run every five seconds so ringing calls respect the 40-second SLA.
    cron.schedule('*/5 * * * * *', async () => {
        try {
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60000);
            const twoMinutesAgo = new Date(now.getTime() - 2 * 60000);

            // 1. Fix Stuck INITIATED/RINGING Calls
            const stuckPending = await CoinsTransaction.find({
                status: { $in: [CallStatus.INITIATED, CallStatus.RINGING] },
                $or: [
                    { ringExpiresAt: { $lte: now } },
                    { ringExpiresAt: { $exists: false }, createdAt: { $lt: fiveMinutesAgo } }
                ]
            });

            if (stuckPending.length > 0) {
                console.log(`found ${stuckPending.length} stuck pending calls`);
                for (const txn of stuckPending) {
                    txn.status = CallStatus.MISSED;
                    txn.callEnd = now;
                    await txn.save();

                    // Release host
                    await User.findByIdAndUpdate(txn.hostId, { isBusy: false });
                    const payload = { transactionId: String(txn._id), reason: 'no_answer' };
                    const io = getIO();
                    io.to(getUserRoom(String(txn.userId))).emit('callEnded', payload);
                    io.to(getUserRoom(String(txn.hostId))).emit('callEnded', payload);
                    const [caller, host] = await Promise.all([
                        User.findById(txn.userId).select('name image fcmToken').lean(),
                        User.findById(txn.hostId).select('name image fcmToken').lean(),
                    ]);
                    await Promise.all([
                        createNotification(
                            String(txn.userId),
                            'Missed call',
                            `${host?.name || 'Host'} did not answer your call`,
                            'call',
                            { transactionId: String(txn._id), targetUserId: String(txn.hostId), targetName: host?.name, targetImage: host?.image }
                        ),
                        createNotification(
                            String(txn.hostId),
                            'Missed call',
                            `You missed a call from ${caller?.name || 'User'}`,
                            'call',
                            { transactionId: String(txn._id), targetUserId: String(txn.userId), targetName: caller?.name, targetImage: caller?.image }
                        ),
                    ]);
                    if (host?.fcmToken) {
                        sendMissedCallNotification(host.fcmToken, caller?.name || 'User', caller?.image || '', String(txn.userId));
                    }
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
                    console.log(`💥 Auto-ending ZOMBIE Call: ${txn._id} (Last HB: ${txn.lastHeartbeat})`);

                    // Bill until last heartbeat (not now) — fairer to user
                    const endTime = txn.lastHeartbeat || new Date();

                    // Fetch participant IDs before billing so socket routing is available
                    const txRef = { userId: txn.userId, hostId: txn.hostId };

                    const result = await BillingService.processCallEnd(txn._id as any, endTime);

                    // BUG-03 + BUG-11 FIX: Emit callEnded so both app screens dismiss
                    if (result.success) {
                        const io = getIO();
                        const payload = result.data ?? { transactionId: String(txn._id) };
                        io.to(getUserRoom(String(txRef.userId))).emit('callEnded', payload);
                        io.to(getUserRoom(String(txRef.hostId))).emit('callEnded', payload);
                        io.to(`call:${String(txn._id)}`).emit('callEnded', payload);
                    } else {
                        console.error(`❌ Zombie billing failed for ${txn._id}: ${result.message}`);
                    }
                }
            }

        } catch (error) {
            console.error('Janitor Error:', error);
        }
    });
};
