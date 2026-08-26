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
        const sender = await User.findById(senderId).session(session);
        if (!sender) {
            await session.abortTransaction();
            return sendResponse(res, 404, false, "Sender not found");
        }

        let rawReceiverId = req.body.receiverId || req.body.receiver || req.body.recipientId;

        if (callId) {
            callTransaction = await CoinsTransaction.findById(callId).session(session);
            if (callTransaction) {
                receiverId = String(callTransaction.userId) === String(senderId)
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

        const receiver = await User.findById(receiverId).session(session);
        if (!receiver) {
            await session.abortTransaction();
            return sendResponse(res, 404, false, "Gift recipient not found");
        }

        const systemSettings = await getCachedSettings();
        const giftCommissionPercent = Math.max(
            0,
            Math.min(100, Number(systemSettings.giftCommissionPercent ?? DEFAULT_COMMISSION_PERCENT))
        );
        const hostEarningShare = (100 - giftCommissionPercent) / 100;
        const hostEarning = Math.round(totalCost * hostEarningShare);
        const platformCommission = Math.max(0, totalCost - hostEarning);

        const activeStatuses = [CallStatus.ACCEPTED, CallStatus.CONNECTING, CallStatus.CONNECTED, CallStatus.RINGING];
        const callRate = Number((callTransaction?.meta as any)?.callDiamondsPerMinute || 100);
        const reservedCoinsForCall =
            callTransaction &&
            String(callTransaction.userId) === String(senderId) &&
            activeStatuses.includes(callTransaction.status)
                ? callRate
                : 0;

        const totalBalance = Number(sender.coins || 0) + Number(sender.diamonds || 0);
        const spendableBalance = Math.max(0, totalBalance - reservedCoinsForCall);

        if (totalBalance < totalCost) {
            await session.abortTransaction();
            return sendResponse(
                res,
                400,
                false,
                "Insufficient coins to send this gift"
            );
        }

        // Deduct from Sender (coins first, then diamonds)
        let remainingDeduct = totalCost;
        let coinsDeduct = Math.min(sender.coins || 0, remainingDeduct);
        remainingDeduct -= coinsDeduct;
        let diamondsDeduct = Math.min(sender.diamonds || 0, remainingDeduct);

        sender.coins = (sender.coins || 0) - coinsDeduct;
        sender.diamonds = (sender.diamonds || 0) - diamondsDeduct;
        await sender.save({ session });

        // Add to Receiver (Host earns coins)
        let updatedReceiver: any = null;
        if (hostEarning > 0) {
            updatedReceiver = await User.findByIdAndUpdate(
                receiverId,
                { $inc: { coins: hostEarning } },
                { session, new: true }
            );
        } else {
            updatedReceiver = await User.findById(receiverId).session(session);
        }

        // Record Transaction
        await CoinsTransaction.create([{
            userId: sender._id,
            hostId: receiverId,
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
            receiverId: String(receiverId),
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
        io.to(getUserRoom(String(receiverId))).emit('giftReceived', giftPayload);
        io.to(getUserRoom(String(sender._id))).emit('giftReceived', giftPayload);

        // Emit real-time updated balance to Sender
        io.to(getUserRoom(String(sender._id))).emit('balanceUpdated', {
            userId: String(sender._id),
            coins: Number(sender.coins || 0),
            diamonds: Number(sender.diamonds || 0),
            totalBalance: Number(sender.coins || 0) + Number(sender.diamonds || 0),
        });

        // Emit real-time updated balance to Receiver (Host gets Coins)
        if (updatedReceiver) {
            io.to(getUserRoom(String(receiverId))).emit('balanceUpdated', {
                userId: String(receiverId),
                coins: Number(updatedReceiver.coins || 0),
                diamonds: Number(updatedReceiver.diamonds || 0),
                totalBalance: Number(updatedReceiver.coins || 0) + Number(updatedReceiver.diamonds || 0),
            });
        }

        return sendResponse(res, 200, true, "Gift sent successfully", {
            newBalance: Number(sender.coins || 0) + Number(sender.diamonds || 0),
            diamonds: Number(sender.diamonds || 0),
            coins: Number(sender.coins || 0),
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
