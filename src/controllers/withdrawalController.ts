
import { Response } from "express";
import { AuthRequest } from "../middlewares/authorize.middleware";
import sendResponse from "../utils/reponse";
import { Withdrawal, WithdrawalStatus, WithdrawalMethod } from "../models/withdrawal.model";
import { User } from "../models/user.model";
import { VerificationSettings } from "../models/verification.model";
import { Logger } from "../utils/logger";
import mongoose from "mongoose";
import { createNotification } from "./notificationController";
import {
    MIN_WITHDRAWAL_COINS,
    MIN_WITHDRAWAL_INR,
    WITHDRAWAL_COINS_PER_INR,
    WITHDRAWAL_PLATFORM_FEE_PERCENT,
} from "../configs/monetization";
import { HierarchyScopeService } from "../utils/hierarchyScope";
import { getCachedSettings } from "./settingsController";

const ADMIN_ROLES = new Set(["owner", "operator", "superAdmin", "admin", "agency"]);

// User: Request Withdrawal
export const requestWithdrawal = async (req: AuthRequest, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { userId } = req.user || {};
        const { amount, method, details } = req.body; // amount in INR

        const requestedAmount = Number(amount);
        const appSettings = await getCachedSettings();
        const withdrawalPlatformFeePercent = Math.min(100, Math.max(0, Number(
            appSettings.withdrawalPlatformFeePercent ?? WITHDRAWAL_PLATFORM_FEE_PERCENT
        )));
        if (!Number.isFinite(requestedAmount) || requestedAmount < MIN_WITHDRAWAL_INR) {
            await session.abortTransaction();
            return sendResponse(res, 400, false, `Minimum withdrawal is ₹${MIN_WITHDRAWAL_INR} (${MIN_WITHDRAWAL_COINS} coins)`);
        }

        if (![WithdrawalMethod.BANK, WithdrawalMethod.UPI].includes(method)) {
            await session.abortTransaction();
            return sendResponse(res, 400, false, "Invalid withdrawal method");
        }

        // 1. Apply configurable manual verification gates.
        const user = await User.findOne({ userId }).session(session);
        if (!user) {
            await session.abortTransaction();
            return sendResponse(res, 404, false, "User not found");
        }
        const verificationSettings = await VerificationSettings.findOne({ singletonKey: "default" }).lean();
        const faceRequired = verificationSettings?.faceVerificationEnabled &&
            verificationSettings.rolesRequiringFaceVerification?.includes(String(user.role));
        const kycRequired = verificationSettings?.kycVerificationEnabled &&
            verificationSettings.rolesRequiringKycVerification?.includes(String(user.role));
        if ((faceRequired && user.faceVerificationStatus !== "APPROVED") ||
            (kycRequired && user.kycVerificationStatus !== "APPROVED")) {
            await session.abortTransaction();
            return sendResponse(res, 403, false, "Face and KYC verification are required for this action.");
        }

        // 2. Check Balance

        const grossAmount = Math.round(requestedAmount * 100) / 100;
        const platformFee = Math.round(grossAmount * withdrawalPlatformFeePercent) / 100;
        const netAmount = Math.round((grossAmount - platformFee) * 100) / 100;
        const coinsRequired = Math.ceil(grossAmount * WITHDRAWAL_COINS_PER_INR);
        const currentCoins = user.coins || 0;

        if (currentCoins < coinsRequired) {
            await session.abortTransaction();
            return sendResponse(res, 400, false, `Insufficient coins. You need ${coinsRequired} coins for ₹${requestedAmount}`);
        }

        // 3. Deduct Coins (Hold them)
        user.coins = currentCoins - coinsRequired;
        await user.save({ session });

        // 4. Create Request
        await Withdrawal.create([{
            userId,
            amount: netAmount,
            grossAmount,
            platformFee,
            platformFeePercent: withdrawalPlatformFeePercent,
            coinsDeducted: coinsRequired,
            method,
            details,
            status: WithdrawalStatus.PENDING
        }], { session });

        await session.commitTransaction();
        return sendResponse(res, 200, true, "Withdrawal request submitted successfully", { grossAmount, platformFee, platformFeePercent: withdrawalPlatformFeePercent, netAmount, coinsDeducted: coinsRequired });

    } catch (error: any) {
        await session.abortTransaction();
        await Logger("requestWithdrawal", error);
        return sendResponse(res, 500, false, error.message);
    } finally {
        session.endSession();
    }
};

// User: Get History
export const getMyWithdrawals = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.user || {};
        const history = await Withdrawal.find({ userId }).sort({ createdAt: -1 });
        return sendResponse(res, 200, true, "History fetched", history);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}

// Admin: Get Pending
export const getPendingWithdrawals = async (req: AuthRequest, res: Response) => {
    try {
        const { role, id } = req.user || {};
        if (!role || !id || !ADMIN_ROLES.has(role)) {
            return sendResponse(res, 403, false, "You are not allowed to view withdrawal requests");
        }
        let filter: any = { status: WithdrawalStatus.PENDING };

        if (!["owner", "operator"].includes(role)) {
            const userScope = HierarchyScopeService.buildUserScope({ id: String(id), role });
            const myHosts = await User.find({
                $and: [userScope, { role: "host" }],
            }).select("userId");
            const hostUserIds = myHosts.map((host) => host.userId);
            filter.userId = { $in: hostUserIds };
        }

        const list = await Withdrawal.find(filter).sort({ createdAt: 1 });

        // Enrich with User info (Name, MeethiId) for display? 
        // Frontend might need it. For now, returning list. 
        // Ideally we should aggregate or populate, but userId is Number, not ObjectId ref. 
        // We might need to manual populate in Frontend or loop here.
        // Let's loop here to add user details efficiently? 
        // Or just send list and let frontend handle it? 
        // Given 'list' could be long, backend population is better.

        // Manual population since ref is not standard ObjectId
        const enrichedList = await Promise.all(list.map(async (w) => {
            const u = await User.findOne({ userId: w.userId }).select('name userId meethiId image');
            return {
                ...w.toObject(),
                user: u
            };
        }));

        return sendResponse(res, 200, true, "Pending withdrawals", enrichedList);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}

// Admin: Approve/Reject
export const processWithdrawal = async (req: AuthRequest, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { withdrawalId, status, rejectionReason, transactionId } = req.body;

        if (![WithdrawalStatus.APPROVED, WithdrawalStatus.REJECTED].includes(status)) {
            await session.abortTransaction();
            return sendResponse(res, 400, false, "Invalid status");
        }

        const withdrawal = await Withdrawal.findById(withdrawalId).session(session);
        if (!withdrawal) {
            await session.abortTransaction();
            return sendResponse(res, 404, false, "Request not found");
        }

        // Security Check for Admin
        const { role, id } = req.user || {};
        if (!role || !id || !ADMIN_ROLES.has(role)) {
            await session.abortTransaction();
            return sendResponse(res, 403, false, "You are not allowed to process withdrawals");
        }
        if (!["owner", "operator"].includes(role)) {
            const userScope = HierarchyScopeService.buildUserScope({ id: String(id), role });
            const hostUser = await User.findOne({
                $and: [userScope, { userId: withdrawal.userId, role: "host" }],
            }).session(session);

            if (!hostUser) {
                await session.abortTransaction();
                return sendResponse(res, 403, false, "Unauthorized to process this withdrawal");
            }
        }

        if (withdrawal.status !== WithdrawalStatus.PENDING) {
            await session.abortTransaction();
            return sendResponse(res, 400, false, "Request already processed");
        }

        withdrawal.status = status;

        if (status === WithdrawalStatus.REJECTED) {
            // Refund coins
            withdrawal.rejectionReason = rejectionReason || "Rejected by admin";
            await User.findOneAndUpdate(
                { userId: withdrawal.userId },
                { $inc: { coins: withdrawal.coinsDeducted } },
                { session }
            );
        } else {
            // Approved
            withdrawal.transactionId = transactionId; // Admin enters bank ref ID
        }

        await withdrawal.save({ session });
        await session.commitTransaction();

        // Trigger Notification
        try {
            const user = await User.findOne({ userId: withdrawal.userId });
            if (user) {
                await createNotification(
                    user.id,
                    `Withdrawal ${status === 'approved' ? 'Successful' : 'Rejected'}`,
                    status === 'approved'
                        ? `Your withdrawal of ₹${withdrawal.amount} has been processed.`
                        : `Your withdrawal request was rejected: ${withdrawal.rejectionReason}`,
                    'transaction'
                );
            }
        } catch (notifError) {
            console.error("Notification trigger error:", notifError);
        }

        return sendResponse(res, 200, true, `Withdrawal ${status} successfully`);

    } catch (error: any) {
        await session.abortTransaction();
        return sendResponse(res, 500, false, error.message);
    } finally {
        session.endSession();
    }
}
