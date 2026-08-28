import { Response } from "express";
import { AuthRequest } from "../middlewares/authorize.middleware";
import { Gift } from "../models/gift.model";
import { User } from "../models/user.model";
import sendResponse from "../utils/reponse";
import { CoinsTransaction } from "../models/spentCoinModel";
import { CallStatus, TransactionType } from "../constants/user";
import mongoose from "mongoose";
import { getIO, getUserRoom } from "../sockets";
import { getCachedSettings } from "./settingsController";
import { deductUserWalletAtomic } from "../services/billing.service";

const DEFAULT_COMMISSION_PERCENT = 30;

// Get All Active Gifts (grouped by category for users)
export const getAllGifts = async (req: AuthRequest, res: Response) => {
    try {
        const gifts = await Gift.find({ isActive: true }).sort({ cost: 1 });
        return sendResponse(res, 200, true, "Gifts fetched successfully", gifts);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

export const getGifts = getAllGifts;

// Send Gift (In-Call or Direct)
export const sendGift = async (req: AuthRequest, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { giftId, callId, count } = req.body;
        const senderId = req.user?.id;

        if (!giftId) {
            await session.abortTransaction();
            return sendResponse(res, 400, false, "giftId is required");
        }

        const qty = Math.max(1, Number(count) || 1);

        const giftDoc = await Gift.findById(giftId).session(session);
        if (!giftDoc || !giftDoc.isActive) {
            await session.abortTransaction();
            return sendResponse(res, 404, false, "Gift not found or inactive");
        }

        const totalCost = giftDoc.cost * qty;
        const sender = mongoose.Types.ObjectId.isValid(String(senderId))
            ? await User.findById(senderId).session(session)
            : await User.findOne({ $or: [{ userId: Number(senderId) || 0 }, { meethiId: String(senderId) }] }).session(session);

        if (!sender) {
            await session.abortTransaction();
            return sendResponse(res, 404, false, "Sender not found");
        }

        let receiverId: string | mongoose.Types.ObjectId | null = null;
        let callTransaction: any = null;
        let rawReceiverId = req.body.receiverId || req.body.receiver || req.body.recipientId || req.body.hostId;

        if (callId) {
            callTransaction = await CoinsTransaction.findById(callId).session(session);
            if (callTransaction) {
                receiverId = String(callTransaction.userId) === String(sender._id)
                    ? callTransaction.hostId
                    : callTransaction.userId;
            }
        }

        if (!receiverId && rawReceiverId) {
            receiverId = rawReceiverId;
        }

        if (!receiverId) {
            await session.abortTransaction();
            return sendResponse(res, 400, false, "Receiver not found for gift");
        }

        let receiver: any = null;
        if (mongoose.Types.ObjectId.isValid(String(receiverId))) {
            receiver = await User.findById(receiverId).session(session);
        }
        if (!receiver) {
            const numId = Number(receiverId);
            receiver = await User.findOne({
                $or: [
                    ...(isNaN(numId) ? [] : [{ userId: numId }]),
                    { meethiId: String(receiverId) }
                ]
            }).session(session);
        }

        if (!receiver) {
            await session.abortTransaction();
            return sendResponse(res, 404, false, "Gift recipient not found");
        }

        const realReceiverId = receiver._id;

        const systemSettings = await getCachedSettings();
        const giftCommissionPercent = Math.max(
            0,
            Math.min(100, Number(systemSettings.giftCommissionPercent ?? DEFAULT_COMMISSION_PERCENT))
        );
        const hostEarningShare = (100 - giftCommissionPercent) / 100;
        const hostEarning = Math.round(totalCost * hostEarningShare);
        const platformCommission = Math.max(0, totalCost - hostEarning);

        // Deduct from Sender atomically (coins first, then diamonds)
        const deductResult = await deductUserWalletAtomic(sender._id, totalCost, session);
        if (!deductResult.success) {
            await session.abortTransaction();
            return sendResponse(
                res,
                400,
                false,
                "INSUFFICIENT_DIAMONDS: Insufficient balance to send this gift",
                { code: 'INSUFFICIENT_DIAMONDS', errorCode: 'INSUFFICIENT_DIAMONDS' }
            );
        }

        const updatedSender = await User.findById(sender._id).session(session) as any;
        let updatedReceiver: any = null;
        if (hostEarning > 0) {
            updatedReceiver = await User.findByIdAndUpdate(
                realReceiverId,
                { $inc: { coins: hostEarning } },
                { session, new: true }
            );
        } else {
            updatedReceiver = await User.findById(realReceiverId).session(session);
        }

        // Record Transaction
        await CoinsTransaction.create([{
            userId: sender._id,
            hostId: realReceiverId,
            type: TransactionType.GIFT_SENT || 'gift_sent',
            coinsSpent: totalCost,
            hostEarning,
            status: CallStatus.ENDED,
            meta: { giftId: giftDoc._id, giftName: giftDoc.name, callId, count: qty, giftCommissionPercent, platformCommission }
        }], { session });

        await session.commitTransaction();

        const giftPayload = {
            callId: callId ? String(callId) : '',
            senderId: String(sender._id),
            senderUserId: sender.userId,
            receiverId: String(realReceiverId),
            receiverUserId: receiver.userId,
            giftId: String(giftDoc._id),
            name: giftDoc.name,
            icon: giftDoc.icon,
            animationUrl: giftDoc.animationUrl || '',
            mediaType: giftDoc.mediaType || 'image',
            count: qty,
            totalCost,
            hostEarning,
            giftCommissionPercent,
        };

        const io = getIO();
        const receiverRooms = [
            `user:${realReceiverId}`,
            ...(receiver.userId ? [`user:${receiver.userId}`] : []),
            ...(receiver.meethiId ? [`user:${receiver.meethiId}`] : [])
        ];
        const senderRooms = [
            `user:${sender._id}`,
            ...(sender.userId ? [`user:${sender.userId}`] : []),
            ...(sender.meethiId ? [`user:${sender.meethiId}`] : [])
        ];

        receiverRooms.forEach(room => io.to(room).emit('giftReceived', giftPayload));
        senderRooms.forEach(room => io.to(room).emit('giftReceived', giftPayload));
        if (callId) {
            io.to(`call:${callId}`).emit('giftReceived', giftPayload);
        }

        // Emit real-time updated balance to Sender
        const activeSender = updatedSender || sender;
        const senderBalPayload = {
            userId: String(sender._id),
            coins: Number(activeSender.coins || 0),
            diamonds: Number(activeSender.diamonds || 0),
            totalBalance: Number(activeSender.coins || 0) + Number(activeSender.diamonds || 0),
        };
        senderRooms.forEach(room => io.to(room).emit('balanceUpdated', senderBalPayload));

        // Emit real-time updated balance to Receiver (Host gets Coins)
        if (updatedReceiver) {
            const receiverBalPayload = {
                userId: String(realReceiverId),
                coins: Number(updatedReceiver.coins || 0),
                diamonds: Number(updatedReceiver.diamonds || 0),
                totalBalance: Number(updatedReceiver.coins || 0) + Number(updatedReceiver.diamonds || 0),
            };
            receiverRooms.forEach(room => io.to(room).emit('balanceUpdated', receiverBalPayload));
        }

        // Check if sender balance is 0 after gift and terminates active call immediately
        const senderTotalBal = Number(activeSender.coins || 0) + Number(activeSender.diamonds || 0);
        if (senderTotalBal <= 0) {
            const activeCallId = callId || callTransaction?._id;
            let targetCallId = activeCallId;
            if (!targetCallId) {
                const activeCallDoc = await CoinsTransaction.findOne({
                    userId: sender._id,
                    status: { $in: [CallStatus.ACCEPTED, CallStatus.CONNECTING, CallStatus.CONNECTED] }
                }).select('_id').lean();
                if (activeCallDoc) {
                    targetCallId = activeCallDoc._id;
                }
            }
            if (targetCallId) {
                console.log(`[GIFT] Sender balance reached 0 after gift. Terminating active call ${targetCallId}`);
                const { BillingService } = await import("../services/billing.service");
                BillingService.processActiveCallBilling(targetCallId as any).catch(err => {
                    console.error("Error terminating active call after gift:", err);
                });
            }
        }

        return sendResponse(res, 200, true, "Gift sent successfully", {
            newBalance: Number(activeSender.coins || 0) + Number(activeSender.diamonds || 0),
            diamonds: Number(activeSender.diamonds || 0),
            coins: Number(activeSender.coins || 0),
            hostEarnedCoins: hostEarning,
            totalBalance: Number(sender.coins || 0) + Number(sender.diamonds || 0),
            giftName: giftDoc.name,
            ...giftPayload,
        });
    } catch (error: any) {
        await session.abortTransaction();
        return sendResponse(res, 500, false, error.message);
    } finally {
        session.endSession();
    }
};

// Admin: Add Gift
export const createGift = async (req: AuthRequest, res: Response) => {
    try {
        const { name, icon, animationUrl, mediaType, cost, category } = req.body;
        const giftDoc = await Gift.create({ name, icon, animationUrl, mediaType, cost, category });
        try {
            getIO().emit("giftCatalogUpdated", { action: "create", gift: giftDoc });
        } catch (e) { }
        return sendResponse(res, 201, true, "Gift created", giftDoc);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

// Admin: Get All Gifts (including inactive)
export const getAllGiftsAdmin = async (req: AuthRequest, res: Response) => {
    try {
        const gifts = await Gift.find().sort({ createdAt: -1 });
        return sendResponse(res, 200, true, "All gifts fetched", gifts);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

// Admin: Toggle gift active/inactive
export const toggleGiftActive = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        const giftDoc = await Gift.findByIdAndUpdate(id, { isActive }, { new: true });
        if (!giftDoc) return sendResponse(res, 404, false, "Gift not found");
        try {
            getIO().emit("giftCatalogUpdated", { action: "toggle", giftId: id, isActive });
        } catch (e) { }
        return sendResponse(res, 200, true, `Gift ${isActive ? 'enabled' : 'disabled'}`, giftDoc);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

// Admin: Update Gift details
export const updateGift = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name, icon, animationUrl, mediaType, cost, category, isActive } = req.body;

        const updated = await Gift.findByIdAndUpdate(
            id,
            { name, icon, animationUrl, mediaType, cost, category, isActive },
            { new: true, runValidators: true }
        );

        if (!updated) return sendResponse(res, 404, false, "Gift not found");
        try {
            getIO().emit("giftCatalogUpdated", { action: "update", gift: updated });
        } catch (e) { }
        return sendResponse(res, 200, true, "Gift updated successfully", updated);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

// Admin: Delete Gift (hard delete)
export const deleteGift = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const giftDoc = await Gift.findByIdAndDelete(id);
        if (!giftDoc) return sendResponse(res, 404, false, "Gift not found");
        try {
            getIO().emit("giftCatalogUpdated", { action: "delete", giftId: id });
        } catch (e) { }
        return sendResponse(res, 200, true, "Gift deleted successfully");
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};
