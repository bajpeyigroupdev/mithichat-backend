
import { Response } from "express";
import { AuthRequest } from "../middlewares/authorize.middleware";
import sendResponse from "../utils/reponse";
import { Gift } from "../models/gift.model";
import { User } from "../models/user.model";
import { CoinsTransaction } from "../models/spentCoinModel";
import { TransactionType, CallStatus } from "../constants/user";
import mongoose from "mongoose";

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
        const { userId } = req.user || {};
        let { giftId, receiverId, callId } = req.body;

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

        const sender = await User.findById(userId).session(session);
        if (!sender || (sender.coins || 0) < gift.cost) {
            await session.abortTransaction();
            return sendResponse(res, 400, false, "Insufficient coins");
        }

        // Deduct from Sender
        sender.coins = (sender.coins || 0) - gift.cost; // Safely deduct
        await sender.save({ session });

        // Add to Receiver
        await User.findByIdAndUpdate(receiverId, { $inc: { coins: gift.cost } }, { session });

        // Record Transaction
        await CoinsTransaction.create([{
            userId: sender._id,
            hostId: receiverId,
            type: TransactionType.GIFT_SENT || 'gift_sent', // Ensure enum has this or use string
            coinsSpent: gift.cost,
            hostEarning: gift.cost, // Host gets full value? Or split? assuming full for now
            status: CallStatus.ENDED, // Immediate transaction
            meta: { giftId: gift._id, giftName: gift.name, callId }
        }], { session });

        await session.commitTransaction();

        return sendResponse(res, 200, true, "Gift sent successfully", {
            newBalance: sender.coins,
            giftName: gift.name,
            icon: gift.icon
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
        const { name, icon, cost, category } = req.body;
        const gift = await Gift.create({ name, icon, cost, category });
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
