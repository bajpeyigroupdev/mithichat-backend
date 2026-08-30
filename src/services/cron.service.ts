
import cron from 'node-cron';
import { CoinsTransaction } from '../models/spentCoinModel';
import { User } from '../models/user.model';
import { CallStatus } from '../constants/user';
import { BillingService } from './billing.service';
import { ChatQueueService } from './chatQueue.service';
import { getIO, getUserRoom } from '../sockets';
import { createNotification } from '../controllers/notificationController';
import { sendMissedCallNotification } from '../utils/pushNotification';
import { notifyHostCallState } from './callStateNotification.service';

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
    // Check unanswered-call expiry every second; active billing remains on a five-second cadence.
    cron.schedule('* * * * * *', async () => {
        try {
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60000);
            const twoMinutesAgo = new Date(now.getTime() - 2 * 60000);

            // 0. Active Call Per-Minute Billing & Balance Check
            if (now.getSeconds() % 5 === 0) {
                const activeCalls = await CoinsTransaction.find({
                    status: { $in: [CallStatus.ACCEPTED, CallStatus.CONNECTING, CallStatus.CONNECTED] }
                }).select('_id status callStart meta userId hostId').lean();

                for (const activeCall of activeCalls) {
                    await BillingService.processActiveCallBilling(activeCall._id as any);
                }
            }

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
                for (const candidate of stuckPending) {
                    const txn = await CoinsTransaction.findOneAndUpdate(
                        {
                            _id: candidate._id,
                            status: { $in: [CallStatus.INITIATED, CallStatus.RINGING] },
                            $or: [
                                { ringExpiresAt: { $lte: now } },
                                { ringExpiresAt: { $exists: false }, createdAt: { $lt: fiveMinutesAgo } }
                            ]
                        },
                        { $set: { status: CallStatus.EXPIRED, callEnd: now } },
                        { new: true }
                    );
                    if (!txn) continue;

                    // Release host
                    await User.findByIdAndUpdate(txn.hostId, { isBusy: false });
                    const payload = { transactionId: String(txn._id), reason: 'no_answer' };
                    const io = getIO();
                    io.to(getUserRoom(String(txn.userId))).emit('callEnded', payload);
                    io.to(getUserRoom(String(txn.hostId))).emit('callEnded', payload);
                    await notifyHostCallState(txn.hostId, String(txn._id), 'expired', now);
                    console.log(`[CALL] EXPIRED ${txn._id} at ${now.toISOString()}`);
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

/**
 * Weekly Host Level Upgrade & Downgrade Cron Job
 * Runs every Sunday night at 12:00 AM (Monday 00:00:00)
 */
export const startWeeklyHostLevelJob = () => {
    // Cron schedule '0 0 * * 1' runs at 00:00:00 every Monday (Sunday 12:00 AM midnight) in Asia/Kolkata timezone
    cron.schedule('0 0 * * 1', async () => {
        console.log('⚡ Weekly Host Level Cron Fired at Sunday Midnight (Monday 00:00:00 IST)!');
        try {
            const { runWeeklyHostLevelRecalculation } = await import('./user.service');
            await runWeeklyHostLevelRecalculation();
        } catch (err) {
            console.error('❌ Weekly Host Level Cron Error:', err);
        }
    }, {
        timezone: 'Asia/Kolkata'
    });
};

/**
 * 2-Hour Stale Host Inactivity Auto-Deactivation Job
 * Runs every 2 minutes to deactivate hosts who have not opened or used the app for 2 hours (120 minutes),
 * even if their Id Manage setting was left ON.
 */
export const startStaleHostCleanupJob = () => {
    cron.schedule('*/2 * * * *', async () => {
        try {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const staleFilter = {
                role: 'host',
                isActive: true,
                $and: [
                    { $or: [{ lastActiveAt: { $lt: twoHoursAgo } }, { lastActiveAt: { $exists: false } }] },
                    { $or: [{ lastOnline: { $lt: twoHoursAgo } }, { lastOnline: { $exists: false } }] },
                    { updatedAt: { $lt: twoHoursAgo } }
                ]
            };

            const result = await User.updateMany(staleFilter, { $set: { isActive: false, isOnline: false } });
            if (result.modifiedCount > 0) {
                console.log(`🧹 [HOST_CLEANUP] Deactivated ${result.modifiedCount} hosts due to 2 hours of app inactivity.`);
            }
        } catch (error) {
            console.error('Stale Host Cleanup Error:', error);
        }
    });
};
