import mongoose, { ClientSession, Types } from 'mongoose';
import { CoinsTransaction } from '../models/spentCoinModel';
import { User } from '../models/user.model';
import { CallStatus, TransactionType } from '../constants/user';
import { updateBalance } from './coins.service';
import Conversation from '../models/conversation.model';
import HostLevel from '../models/hostLevel.model';
import { recalculateAndUpdateHostLevel } from './user.service';
import { getCachedSettings } from '../controllers/settingsController';
import {
    CALL_DIAMONDS_PER_MINUTE,
    HOST_LEVEL_COINS_PER_MINUTE,
} from '../configs/monetization';

export class BillingService {


    /**
     * Process the end of a call with ACID properties (Atomicity).
     * Ensures money is deducted ONLY if the transaction status can be updated.
     * Prevents double-billing and negative balances.
     */
    static async processCallEnd(
        transactionId: string | Types.ObjectId,
        callEndTime: Date = new Date(),
        retryAttempt: number = 0,
        reportedDurationSec?: number
    ): Promise<{
        success: boolean;
        data?: any;
        message: string;
        statusCode: number;
    }> {
        const session: ClientSession = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Fetch Transaction with Write Lock (simulated by finding it within session)
            const transaction = await CoinsTransaction.findById(transactionId).session(session);

            if (!transaction) {
                await session.abortTransaction();
                return { success: false, message: 'Transaction not found', statusCode: 404 };
            }

            // 2. Idempotency Check: Is it already ended?
            if ([CallStatus.ENDED, CallStatus.MISSED, CallStatus.REJECTED, CallStatus.CANCELLED, CallStatus.EXPIRED].includes(transaction.status)) {
                await session.abortTransaction();
                return {
                    success: true,
                    message: 'Call already ended',
                    statusCode: 200,
                    data: {
                        transactionId: transaction._id,
                        duration: transaction.duration,
                        coinsSpent: transaction.coinsSpent,
                        hostEarning: transaction.hostEarning,
                    },
                };
            }

            // 3. Handle calls that never started
            if (!transaction.callStart) {
                transaction.status = CallStatus.MISSED;
                transaction.callEnd = callEndTime;
                transaction.duration = 0;
                transaction.coinsSpent = 0;
                transaction.hostEarning = 0;

                await transaction.save({ session });
                await BillingService.releaseHost(transaction.hostId, session);

                await session.commitTransaction();

                return {
                    success: true,
                    message: 'Call never connected, no coins deducted',
                    statusCode: 200,
                    data: {
                        transactionId: transaction._id,
                        duration: 0,
                        coinsSpent: 0,
                        hostEarning: 0,
                    },
                };
            }

            // 4. Calculate Duration & Cost
            // Store the actual connected duration. Ceil avoids a connected sub-second
            // call being recorded as zero seconds.
            const serverDurationSec = Math.max(
                1,
                Math.ceil(
                    (callEndTime.getTime() - new Date(transaction.callStart).getTime()) / 1000
                )
            );
            const maxPossibleDurationSec = Math.max(
                1,
                Math.ceil(
                    (callEndTime.getTime() - new Date(transaction.createdAt).getTime()) / 1000
                )
            );
            const normalizedReportedDuration = Number.isFinite(Number(reportedDurationSec))
                ? Math.max(1, Math.floor(Number(reportedDurationSec)))
                : 0;
            const safeReportedDurationSec = Math.min(
                normalizedReportedDuration,
                maxPossibleDurationSec,
                serverDurationSec + 20
            );
            // When the app reports its connected-call timer, use it as the
            // authoritative duration after validation. Server receipt time can
            // include HTTP/socket teardown delay after the visible timer stops.
            const durationSec =
                normalizedReportedDuration > 0
                    ? safeReportedDurationSec
                    : serverDurationSec;
            const billedMinutes = Math.ceil(durationSec / 60);

            // ===== Level-based host earning =====
            // Recalculate and update host's current level, then find coinPerMinute from HostLevel config
            const hostLevel = await recalculateAndUpdateHostLevel(transaction.hostId, session);
            const hostLevelConfig = await HostLevel.findOne({ level: hostLevel }).session(session).lean() as any;

            const hostSharePerMinute =
                hostLevelConfig?.coinPerMinute ??
                HOST_LEVEL_COINS_PER_MINUTE[hostLevel] ??
                HOST_LEVEL_COINS_PER_MINUTE[1];
            const HOST_SHARE_PER_SECOND = hostSharePerMinute / 60;
            console.log(`📊 Host Lv.${hostLevel} → coinPerMinute: ${hostSharePerMinute}`);
            // ====================================

            // Caller pays per started minute, while host earning stays proportional
            // to the exact connected seconds at the configured level rate.
            const startMeta = transaction.meta as any;
            const fallbackSettings = startMeta?.callDiamondsPerMinute ? null : await getCachedSettings();
            const callDiamondsPerMinute = Math.max(1, Number(
                startMeta?.callDiamondsPerMinute || fallbackSettings?.callRatePerMinute || CALL_DIAMONDS_PER_MINUTE
            ));
            const coinsSpent = billedMinutes * callDiamondsPerMinute;
            const hostEarning = Math.round(durationSec * HOST_SHARE_PER_SECOND);

            // 5. Update Transaction State
            transaction.callEnd = callEndTime;
            if (normalizedReportedDuration > 0) {
                transaction.callStart = new Date(
                    callEndTime.getTime() - durationSec * 1000
                );
            }
            transaction.status = CallStatus.ENDED;
            transaction.duration = durationSec;
            transaction.coinsSpent = coinsSpent;
            transaction.hostEarning = hostEarning;
            transaction.meta = {
                ...(transaction.meta || {}),
                billing: {
                    hostLevel,
                    hostCoinPerMinute: hostSharePerMinute,
                    callDiamondsPerMinute,
                    platformCommissionRate: Number(startMeta?.platformCommissionRate || fallbackSettings?.commissionRate || 0),
                    billedMinutes,
                    billingMode: 'started_minute',
                    reportedDurationSec: normalizedReportedDuration || undefined,
                },
            };

            // 6. Deduct from User (coins first, then diamonds)
            if (durationSec > 0 && coinsSpent > 0) {
                const user = await User.findById(transaction.userId).session(session);
                if (user) {
                    let remaining = coinsSpent;
                    let coinsDeduct = Math.min(user.coins || 0, remaining);
                    remaining -= coinsDeduct;
                    let diamondsDeduct = Math.min(user.diamonds || 0, remaining);

                    await User.findByIdAndUpdate(
                        transaction.userId,
                        {
                            $inc: {
                                coins: -coinsDeduct,
                                diamonds: -diamondsDeduct,
                            }
                        },
                        { session }
                    );

                    transaction.coinsSpent = coinsDeduct + diamondsDeduct;
                }

                // Host earns coins
                if (transaction.hostEarning > 0) {
                    await User.findByIdAndUpdate(
                        transaction.hostId,
                        { $inc: { coins: transaction.hostEarning } },
                        { session }
                    );
                }
            }

            await transaction.save({ session });
            await BillingService.releaseHost(transaction.hostId, session);

            await session.commitTransaction();

            // 7. Post-commit: Check if chat should be enabled (10-minute rule)
            this.checkAndEnableChat(transaction.userId, transaction.hostId).catch(err =>
                console.error("Failed to enable chat after call:", err)
            );

            return {
                success: true,
                message: 'Call ended successfully',
                statusCode: 200,
                data: {
                    transactionId: transaction._id,
                    duration: transaction.duration,
                    coinsSpent: transaction.coinsSpent,
                    hostEarning: transaction.hostEarning,
                },
            };
        } catch (error: any) {
            if (session.inTransaction()) await session.abortTransaction();
            if (error.code === 11000 || retryAttempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 80 * (retryAttempt + 1)));
                return BillingService.processCallEnd(
                    transactionId,
                    callEndTime,
                    retryAttempt + 1,
                    reportedDurationSec
                );
            }
            console.error('Processing Call End Failed:', error);
            return {
                success: false,
                message: error.message || 'Failed to process call billing',
                statusCode: 500,
            };
        } finally {
            session.endSession();
        }
    }

    static async processPulse(transactionId: string): Promise<boolean> {
        try {
            const now = new Date();
            await CoinsTransaction.updateOne(
                { 
                    _id: transactionId,
                    status: { $in: [CallStatus.ACCEPTED, CallStatus.CONNECTING, CallStatus.CONNECTED] }
                },
                [
                    {
                        $set: {
                            status: CallStatus.CONNECTED,
                            lastHeartbeat: now,
                            callStart: { $ifNull: ["$callStart", now] }
                        }
                    }
                ]
            );
            return true;
        } catch (e) {
            console.error("Pulse Failed:", e);
            return false;
        }
    }

    private static async releaseHost(hostId: Types.ObjectId | unknown, session: ClientSession) {
        if (hostId) {
            await User.findByIdAndUpdate(hostId, { $set: { isBusy: false } }, { session });
        }
    }

    private static async checkAndEnableChat(userId: Types.ObjectId | unknown, hostId: Types.ObjectId | unknown) {
        try {
            if (!userId || !hostId) return;

            // Check total duration
            const transactions = await CoinsTransaction.find({
                $or: [
                    { userId, hostId, type: TransactionType.VOICE_CALL },
                    { userId: hostId, hostId: userId, type: TransactionType.VOICE_CALL }
                ],
                status: CallStatus.ENDED
            }).select("duration");

            const totalDuration = transactions.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);

            if (totalDuration >= 120) { // 2 minutes (Testing)
                // Check if conversation exists
                const conversation = await Conversation.findOne({
                    participants: { $all: [userId, hostId] }
                });

                if (!conversation) {
                    await Conversation.create({
                        participants: [userId, hostId]
                    });
                    console.log(`✅ Chat enabled for ${userId} and ${hostId}`);
                }
            }
        } catch (error: any) {
            console.error("Error in checkAndEnableChat:", error.message);
        }
    }
}
