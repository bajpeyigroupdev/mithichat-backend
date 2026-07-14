import mongoose, { ClientSession, Types } from 'mongoose';
import { CoinsTransaction } from '../models/spentCoinModel';
import { User } from '../models/user.model';
import { CallStatus, TransactionType } from '../constants/user';
import { updateBalance } from './coins.service';
import Conversation from '../models/conversation.model';
import { getCachedSettings } from '../controllers/settingsController';

export class BillingService {


    /**
     * Process the end of a call with ACID properties (Atomicity).
     * Ensures money is deducted ONLY if the transaction status can be updated.
     * Prevents double-billing and negative balances.
     */
    static async processCallEnd(
        transactionId: string | Types.ObjectId,
        callEndTime: Date = new Date(),
        retryAttempt: number = 0
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
            const durationSec = Math.floor(
                (callEndTime.getTime() - new Date(transaction.callStart).getTime()) / 1000
            );

            const settings = await getCachedSettings();
            const CALL_RATE_PER_SECOND = (settings.callRatePerMinute || 100) / 60;
            const HOST_SHARE_PER_SECOND = (settings.hostSharePerMinute || 28) / 60;

            const coinsSpent = Math.round(durationSec * CALL_RATE_PER_SECOND);
            const hostEarning = Math.round(durationSec * HOST_SHARE_PER_SECOND);

            // 5. Update Transaction State
            transaction.callEnd = callEndTime;
            transaction.status = CallStatus.ENDED;
            transaction.duration = durationSec;
            transaction.coinsSpent = coinsSpent;
            transaction.hostEarning = hostEarning;

            // 6. Deduct from User (Atomic Check)
            if (durationSec > 0 && coinsSpent > 0) {
                // Attempt deduction
                const userUpdate = await User.findOneAndUpdate(
                    {
                        _id: transaction.userId,
                        diamonds: { $gte: coinsSpent },
                    },
                    { $inc: { diamonds: -coinsSpent } },
                    { session, new: true }
                );

                if (!userUpdate) {
                    // RETRY STRATEGY: Partial Deduction
                    // If full amount failed, take whatever is left.
                    const user = await User.findById(transaction.userId).session(session);
                    const availableCoins = user?.diamonds || 0;

                    if (availableCoins > 0) {
                        await User.findByIdAndUpdate(
                            transaction.userId,
                            { $setOnInsert: { diamonds: 0 }, $inc: { diamonds: -availableCoins } },
                            { session }
                        );

                        // Update transaction to reflect actuals
                        transaction.coinsSpent = availableCoins;

                        // Adjust Host Earning proportional to partial payment?
                        const ratio = availableCoins / coinsSpent;
                        transaction.hostEarning = Math.floor(hostEarning * ratio);

                        console.warn(`⚠️ Partial payment for Tx ${transactionId}: Required ${coinsSpent}, Took ${availableCoins}`);
                    } else {
                        // User is broke.
                        transaction.coinsSpent = 0;
                        transaction.hostEarning = 0;
                    }
                }

                // Receiver earnings are always Coins, including partial payments.
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
            // We do this after commit to avoid bloating the billing transaction
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
            const isTransient =
                error?.errorLabels?.includes('TransientTransactionError') ||
                [112, 251].includes(Number(error?.code)) ||
                /WriteConflict|TransientTransactionError/i.test(error?.message || '');

            if (isTransient && retryAttempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 80 * (retryAttempt + 1)));
                return BillingService.processCallEnd(transactionId, callEndTime, retryAttempt + 1);
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
            // Atomically update lastHeartbeat, transition status to CONNECTED, and set callStart if it doesn't exist
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
