
import { Response } from "express";
import { AuthRequest } from "../middlewares/authorize.middleware";
import sendResponse from "../utils/reponse";
import { Gift } from "../models/gift.model";
import { User } from "../models/user.model";
import { CoinsTransaction } from "../models/spentCoinModel";
import { TransactionType, CallStatus } from "../constants/user";
import mongoose from "mongoose";
import { getIO, getUserRoom } from "../sockets";

// Get All Gifts
export const getAllGifts = async (req: AuthRequest, res: Response) => {
    try {
        const gifts = await Gift.find({ isActive: true }).sort({ cost: 1 });
        return sendResponse(res, 200, true, "Gifts fetched", gifts);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}

// Send Gift (During Call)
export const sendGift = async (req: AuthRequest, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        // Use req.user.id (MongoDB _id) NOT req.user.userId (numeric custom ID like 330003)
        const senderId = req.user?.id;
        let { giftId, receiverId, callId, count } = req.body;
        const qty = Math.max(1, parseInt(count as string) || 1);

        // Fallback: If no receiverId, find it from the active transaction (callId)
        if (!receiverId && callId) {
            const transaction = await CoinsTransaction.findById(callId).session(session);
            if (transaction) {
                receiverId = transaction.hostId;
            }
        }

        if (!receiverId) {
            await session.abortTransaction();
            return sendResponse(res, 400, false, "Receiver not identified");
        }

        const gift = await Gift.findById(giftId).session(session);
        if (!gift) {
            await session.abortTransaction();
            return sendResponse(res, 404, false, "Gift not found");
        }

        const sender = await User.findById(senderId).session(session);
        const totalCost = gift.cost * qty;
        if (!sender || (sender.diamonds || 0) < totalCost) {
            await session.abortTransaction();
            return sendResponse(res, 400, false, "Insufficient coins");
        }

        // Deduct from Sender
        sender.diamonds = (sender.diamonds || 0) - totalCost;
        await sender.save({ session });

        // Add to Receiver
        await User.findByIdAndUpdate(receiverId, { $inc: { coins: totalCost } }, { session });

        // Record Transaction
        await CoinsTransaction.create([{
            userId: sender._id,
            hostId: receiverId,
            type: TransactionType.GIFT_SENT || 'gift_sent', // Ensure enum has this or use string
            coinsSpent: totalCost,
            hostEarning: totalCost, // Host gets full value? Or split? assuming full for now
            status: CallStatus.ENDED, // Immediate transaction
            meta: { giftId: gift._id, giftName: gift.name, callId, count: qty }
        }], { session });

        await session.commitTransaction();

        const giftPayload = {
            callId: callId ? String(callId) : '',
            senderId: String(sender._id),
            receiverId: String(receiverId),
            giftId: String(gift._id),
            name: gift.name,
            icon: gift.icon,
            animationUrl: gift.animationUrl || '',
            mediaType: gift.mediaType || 'image',
            count: qty,
            totalCost,
        };

        // Both call participants receive the same real-time payload. This
        // keeps the animation synchronized on sender and receiver screens.
        const io = getIO();
        io.to(getUserRoom(String(receiverId))).emit('giftReceived', giftPayload);
        io.to(getUserRoom(String(sender._id))).emit('giftReceived', giftPayload);

        return sendResponse(res, 200, true, "Gift sent successfully", {
            newBalance: sender.diamonds,
            giftName: gift.name,
            ...giftPayload,
        });

    } catch (error: any) {
        await session.abortTransaction();
        return sendResponse(res, 500, false, error.message);
    } finally {
        session.endSession();
    }
}

// Admin: Add Gift
export const createGift = async (req: AuthRequest, res: Response) => {
    try {
        const { name, icon, animationUrl, mediaType, cost, category } = req.body;
        const gift = await Gift.create({ name, icon, animationUrl, mediaType, cost, category });
        return sendResponse(res, 201, true, "Gift created", gift);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}

// Admin: Get All Gifts (including inactive)
export const getAllGiftsAdmin = async (req: AuthRequest, res: Response) => {
    try {
        const gifts = await Gift.find().sort({ createdAt: -1 });
        return sendResponse(res, 200, true, "All gifts fetched", gifts);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}

// Admin: Toggle gift active/inactive
export const toggleGiftActive = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        const gift = await Gift.findByIdAndUpdate(id, { isActive }, { new: true });
        if (!gift) return sendResponse(res, 404, false, "Gift not found");
        return sendResponse(res, 200, true, `Gift ${isActive ? 'enabled' : 'disabled'}`, gift);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}

// Admin: Delete Gift (hard delete)
export const deleteGift = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const gift = await Gift.findByIdAndDelete(id);
        if (!gift) return sendResponse(res, 404, false, "Gift not found");
        return sendResponse(res, 200, true, "Gift deleted");
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}
