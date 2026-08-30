import mongoose, { ClientSession, Types } from 'mongoose';
import { CoinsTransaction } from '../models/spentCoinModel';
import { User } from '../models/user.model';
import { CallStatus, TransactionType } from '../constants/user';
import Conversation from '../models/conversation.model';
import HostLevel from '../models/hostLevel.model';
import { recalculateAndUpdateHostLevel } from './user.service';
import { getCachedSettings } from '../controllers/settingsController';
import { getIO, getUserRoom } from '../sockets';
import {
    CALL_DIAMONDS_PER_MINUTE,
    HOST_LEVEL_COINS_PER_MINUTE,
} from '../configs/monetization';

/**
 * Atomically deducts specified diamond/coin amount from user balance.
 * Uses atomic MongoDB condition to guarantee balance >= amount and prevent negative balance.
 * Handles diamond-only wallets (coins = 0) cleanly without requiring non-zero coins.
 */
export async function deductUserWalletAtomic(
    userId: Types.ObjectId | string,
    amount: number,
    session?: ClientSession
): Promise<{ success: boolean; coinsDeduct: number; diamondsDeduct: number }> {
    if (amount <= 0) return { success: true, coinsDeduct: 0, diamondsDeduct: 0 };

    const query = User.findById(userId);
    if (session) query.session(session);
    const user = await query.lean();

    if (!user) return { success: false, coinsDeduct: 0, diamondsDeduct: 0 };

    const availableCoins = Math.max(0, Number((user as any).coins || 0));
    const availableDiamonds = Math.max(0, Number((user as any).diamonds || 0));

    if (availableCoins + availableDiamonds < amount) {
        return { success: false, coinsDeduct: 0, diamondsDeduct: 0 };
    }

    const coinsDeduct = Math.min(availableCoins, amount);
    const remaining = amount - coinsDeduct;
    const diamondsDeduct = Math.min(availableDiamonds, remaining);

    const updateFilter: any = { _id: userId };
    const updateInc: any = {};

    if (coinsDeduct > 0) {
        updateFilter.coins = { $gte: coinsDeduct };
        updateInc.coins = -coinsDeduct;
    }

    if (diamondsDeduct > 0) {
        updateFilter.diamonds = { $gte: diamondsDeduct };
        updateInc.diamonds = -diamondsDeduct;
    }

    let updatedUser: any = null;
    if (session) {
        updatedUser = await User.findOneAndUpdate(updateFilter, { $inc: updateInc }, { session, new: true });
    } else {
        updatedUser = await User.findOneAndUpdate(updateFilter, { $inc: updateInc }, { new: true });
    }

    if (!updatedUser) {
        return { success: false, coinsDeduct: 0, diamondsDeduct: 0 };
    }

    return { success: true, coinsDeduct, diamondsDeduct };
}

export class BillingService {

    /**
     * Mid-call per-minute diamond block billing.
     * Enforces 100 diamonds / minute ceiling calculation: billableMinutes = Math.ceil(durationSeconds / 60).
     * Atomically secures 100 diamonds for each started minute.
     * Immediately terminates call if caller balance is insufficient for next minute.
     */
    static async processActiveCallBilling(
        transactionId: string | Types.ObjectId,
        retryAttempt: number = 0
    ): Promise<{ success: boolean; terminated?: boolean; billedMinutes?: number }> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const transaction = await CoinsTransaction.findById(transactionId).session(session);
            if (!transaction) {
                await session.abortTransaction();
                return { success: false };
            }

            const activeStatuses = [CallStatus.ACCEPTED, CallStatus.CONNECTING, CallStatus.CONNECTED];
            if (!activeStatuses.includes(transaction.status)) {
                await session.abortTransaction();
                return { success: true };
            }

            const now = new Date();
            const callStart = transaction.callStart || now;
            if (!transaction.callStart) {
                transaction.callStart = now;
            }

            const elapsedSec = Math.max(0, Math.floor((now.getTime() - new Date(callStart).getTime()) / 1000));
            const requiredBilledMinutes = Math.floor(elapsedSec / 60) + 1;

            const meta = (transaction.meta || {}) as any;
            let currentlyBilledMinutes = Number(meta.billedMinutes || 0);
            let alreadyBilledAmount = Number(meta.alreadyBilledAmount || 0);

            const fallbackSettings = meta?.callDiamondsPerMinute ? null : await getCachedSettings();
            const callDiamondsPerMinute = Math.max(1, Number(
                meta?.callDiamondsPerMinute || fallbackSettings?.callRatePerMinute || CALL_DIAMONDS_PER_MINUTE
            ));

            // CRITICAL FIX: If currently paid minutes cover the current elapsed duration,
            // the call is ACTIVE and ENTITLED. DO NOT check caller balance for FUTURE minutes yet!
            if (currentlyBilledMinutes >= requiredBilledMinutes) {
                await transaction.save({ session });
                await session.commitTransaction();
                return { success: true, billedMinutes: currentlyBilledMinutes };
            }

            // Process minute blocks sequentially for unbilled minutes (from currentlyBilledMinutes + 1 to requiredBilledMinutes)
            for (let m = currentlyBilledMinutes + 1; m <= requiredBilledMinutes; m++) {
                const liveCaller = await User.findById(transaction.userId).select('coins diamonds').session(session).lean() as any;
                const balanceBefore = Number(liveCaller?.coins || 0) + Number(liveCaller?.diamonds || 0);

                console.log(`[BILLING] TRANSACTION ID: ${transactionId}`);
                console.log(`[BILLING] RATE: ${callDiamondsPerMinute}`);
                console.log(`[BILLING] BALANCE BEFORE: ${balanceBefore}`);
                console.log(`[BILLING] CURRENT MINUTE: ${m}`);

                const deductResult = await deductUserWalletAtomic(transaction.userId, callDiamondsPerMinute, session);

                if (!deductResult.success) {
                    // Caller cannot afford minute block m!
                    console.log(`[BILLING] NEXT MINUTE ELIGIBLE: false`);
                    console.log(`[BILLING] AUTO TERMINATION: Insufficient balance for Minute ${m} (Balance: ${balanceBefore}, Required: ${callDiamondsPerMinute})`);
                    await session.abortTransaction();

                    // Terminate call cleanly via processCallEnd
                    const endResult = await BillingService.processCallEnd(transactionId, now, 0);

                    // Notify caller & host sockets across all room aliases
                    try {
                        const io = getIO();
                        if (io && typeof io.to === 'function') {
                            const endPayload = {
                                transactionId: String(transactionId),
                                reason: 'INSUFFICIENT_DIAMONDS',
                                errorCode: 'INSUFFICIENT_DIAMONDS',
                                message: 'Call ended due to insufficient diamonds.',
                                duration: endResult.data?.duration || elapsedSec,
                            };
                            const txRef = await CoinsTransaction.findById(transactionId).select('userId hostId').lean() as any;
                            if (txRef) {
                                const callerDoc = await User.findById(txRef.userId).select('_id userId meethiId').lean();
                                const hostDoc = await User.findById(txRef.hostId).select('_id userId meethiId').lean();

                                const callerRooms = [
                                    `user:${txRef.userId}`,
                                    ...(callerDoc?.userId ? [`user:${callerDoc.userId}`] : []),
                                    ...(callerDoc?.meethiId ? [`user:${callerDoc.meethiId}`] : [])
                                ];
                                const hostRooms = [
                                    `user:${txRef.hostId}`,
                                    ...(hostDoc?.userId ? [`user:${hostDoc.userId}`] : []),
                                    ...(hostDoc?.meethiId ? [`user:${hostDoc.meethiId}`] : [])
                                ];

                                callerRooms.forEach(room => io.to(room).emit('callEnded', endPayload));
                                hostRooms.forEach(room => io.to(room).emit('callEnded', endPayload));
                            }
                            io.to(`call:${String(transactionId)}`).emit('callEnded', endPayload);
                        }
                    } catch (e) {
                        console.error('Socket emit error on call termination:', e);
                    }

                    return { success: false, terminated: true, billedMinutes: m - 1 };
                }

                currentlyBilledMinutes = m;
                alreadyBilledAmount += callDiamondsPerMinute;

                const callerAfter = await User.findById(transaction.userId).select('coins diamonds').session(session).lean() as any;
                const balanceAfter = Number(callerAfter?.coins || 0) + Number(callerAfter?.diamonds || 0);
                const minuteDeadline = new Date(callStart.getTime() + m * 60_000);

                console.log(`[BILLING] FIRST MINUTE CHARGED: ${m === 1}`);
                console.log(`[BILLING] CURRENT MINUTE PAID: true`);
                console.log(`[BILLING] CONNECTED AT: ${callStart.toISOString()}`);
                console.log(`[BILLING] MINUTE DEADLINE: ${minuteDeadline.toISOString()}`);
                console.log(`[BILLING] BALANCE AFTER: ${balanceAfter}`);
                console.log(`[BILLING] NEXT MINUTE ELIGIBLE: ${balanceAfter >= callDiamondsPerMinute}`);
            }

            transaction.coinsSpent = alreadyBilledAmount;
            transaction.meta = {
                ...(transaction.meta || {}),
                billedMinutes: currentlyBilledMinutes,
                alreadyBilledAmount,
                callDiamondsPerMinute,
            };

            await transaction.save({ session });
            await session.commitTransaction();

            // Emit real-time updated balance to Caller across all room aliases
            try {
                const liveCaller = await User.findById(transaction.userId).select('coins diamonds userId meethiId').lean() as any;
                if (liveCaller) {
                    const io = getIO();
                    if (io && typeof io.to === 'function') {
                        const callerRooms = [
                            `user:${transaction.userId}`,
                            ...(liveCaller?.userId ? [`user:${liveCaller.userId}`] : []),
                            ...(liveCaller?.meethiId ? [`user:${liveCaller.meethiId}`] : [])
                        ];
                        const balPayload = {
                            userId: String(transaction.userId),
                            coins: Number(liveCaller.coins || 0),
                            diamonds: Number(liveCaller.diamonds || 0),
                            totalBalance: Number(liveCaller.coins || 0) + Number(liveCaller.diamonds || 0),
                        };
                        callerRooms.forEach(room => io.to(room).emit('balanceUpdated', balPayload));
                    }
                }
            } catch (e) {
                console.error('Socket balance emit error:', e);
            }

            return { success: true, billedMinutes: currentlyBilledMinutes };
        } catch (error: any) {
            if (session.inTransaction()) await session.abortTransaction();
            const isTransient = (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError')) || error.code === 112 || error.code === 11000;
            if (isTransient && retryAttempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 60 * (retryAttempt + 1)));
                return BillingService.processActiveCallBilling(transactionId, retryAttempt + 1);
            }
            console.error('Error in processActiveCallBilling:', error);
            return { success: false };
        } finally {
            session.endSession();
        }
    }

    /**
     * Process the end of a call with ACID properties (Atomicity & Idempotency).
     * Ensures money is deducted ONLY if the transaction status can be updated.
     * Prevents double-billing, duplicate host earnings, and negative balances.
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
            // 1. Fetch Transaction
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

            const durationSec =
                normalizedReportedDuration > 0
                    ? safeReportedDurationSec
                    : serverDurationSec;
            const billedMinutes = Math.ceil(durationSec / 60);

            // Level-based host earning
            const hostLevel = await recalculateAndUpdateHostLevel(transaction.hostId, session);
            const hostLevelConfig = await HostLevel.findOne({ level: hostLevel }).session(session).lean() as any;

            const hostSharePerMinute =
                hostLevelConfig?.coinPerMinute ??
                HOST_LEVEL_COINS_PER_MINUTE[hostLevel] ??
                HOST_LEVEL_COINS_PER_MINUTE[1];
            const HOST_SHARE_PER_SECOND = hostSharePerMinute / 60;

            const startMeta = (transaction.meta || {}) as any;
            const fallbackSettings = startMeta?.callDiamondsPerMinute ? null : await getCachedSettings();
            const callDiamondsPerMinute = Math.max(1, Number(
                startMeta?.callDiamondsPerMinute || fallbackSettings?.callRatePerMinute || CALL_DIAMONDS_PER_MINUTE
            ));

            const totalCallCost = billedMinutes * callDiamondsPerMinute;
            const alreadyBilledAmount = Number(startMeta?.alreadyBilledAmount || 0);

            let netDeductRemaining = totalCallCost - alreadyBilledAmount;

            if (netDeductRemaining > 0 && durationSec > 0) {
                const deductRes = await deductUserWalletAtomic(transaction.userId, netDeductRemaining, session);
                if (!deductRes.success) {
                    // Partial deduction if balance ran out mid-minute
                    const user = await User.findById(transaction.userId).session(session);
                    if (user) {
                        const availCoins = Math.max(0, Number(user.coins || 0));
                        const availDiamonds = Math.max(0, Number(user.diamonds || 0));
                        const pCoins = Math.min(availCoins, netDeductRemaining);
                        const pRem = netDeductRemaining - pCoins;
                        const pDiamonds = Math.min(availDiamonds, pRem);

                        if (pCoins > 0 || pDiamonds > 0) {
                            await User.findByIdAndUpdate(
                                transaction.userId,
                                { $inc: { coins: -pCoins, diamonds: -pDiamonds } },
                                { session }
                            );
                        }
                        transaction.coinsSpent = alreadyBilledAmount + pCoins + pDiamonds;
                    }
                } else {
                    transaction.coinsSpent = totalCallCost;
                }
            } else {
                transaction.coinsSpent = alreadyBilledAmount || totalCallCost;
            }

            const hostEarning = Math.round(durationSec * HOST_SHARE_PER_SECOND);
            transaction.hostEarning = hostEarning;

            console.log(`[BILLING] HOST EARNING: TransactionID ${transactionId} | HostID ${transaction.hostId} | Coins: ${hostEarning} | DurationSec: ${durationSec}`);

            // Host earns coins exactly once (idempotent check)
            if (hostEarning > 0 && !startMeta?.hostEarningsCredited) {
                await User.findByIdAndUpdate(
                    transaction.hostId,
                    { $inc: { coins: hostEarning } },
                    { session }
                );
            }

            // 5. Update Transaction State
            transaction.callEnd = callEndTime;
            if (normalizedReportedDuration > 0) {
                transaction.callStart = new Date(
                    callEndTime.getTime() - durationSec * 1000
                );
            }
            transaction.status = CallStatus.ENDED;
            transaction.duration = durationSec;
            transaction.meta = {
                ...(transaction.meta || {}),
                hostEarningsCredited: true,
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

            await transaction.save({ session });
            await BillingService.releaseHost(transaction.hostId, session);

            await session.commitTransaction();

            // Evaluate Referral Milestone (post-commit)
            if (durationSec > 0) {
                const { evaluateReferralCallMilestone } = await import('./referralMilestoneService');
                if (transaction.userId) {
                    evaluateReferralCallMilestone(transaction.userId, durationSec, transaction._id).catch(err =>
                        console.error("Failed to evaluate referral call milestone (user):", err)
                    );
                }
                if (transaction.hostId) {
                    evaluateReferralCallMilestone(transaction.hostId, durationSec, transaction._id).catch(err =>
                        console.error("Failed to evaluate referral call milestone (host):", err)
                    );
                }
            }

            // Enable chat rule
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
            const isTransient = (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError')) || error.code === 112 || error.code === 11000;
            if (isTransient && retryAttempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 60 * (retryAttempt + 1)));
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

            // Await active call billing check
            await BillingService.processActiveCallBilling(transactionId);

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

            const transactions = await CoinsTransaction.find({
                $or: [
                    { userId, hostId, type: TransactionType.VOICE_CALL },
                    { userId: hostId, hostId: userId, type: TransactionType.VOICE_CALL }
                ],
                status: CallStatus.ENDED
            }).select("duration");

            const totalDuration = transactions.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);

            if (totalDuration >= 120) {
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
