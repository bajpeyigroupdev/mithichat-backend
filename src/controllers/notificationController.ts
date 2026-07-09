import { Response } from "express";
import Notification from "../models/notification.model";
import sendResponse from "../utils/reponse";
import { AuthRequest } from "../middlewares/authorize.middleware";

// Helper to create notification internally
export const createNotification = async (
    userId: string,
    title: string,
    message: string,
    type: 'system' | 'promo' | 'transaction' | 'call' = 'system'
) => {
    try {
        await Notification.create({
            userId,
            title,
            message,
            type,
        });
    } catch (error) {
        console.error("Failed to create notification:", error);
    }
};

// GET /notifications
export const getMyNotifications = async (req: AuthRequest, res: Response) => {
    try {
        const { id: userId } = req.user || {};
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Notification.countDocuments({ userId });
        const unreadCount = await Notification.countDocuments({ userId, isRead: false });

        return sendResponse(res, 200, true, "Notifications fetched successfully", {
            notifications,
            unreadCount,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
        });
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

// PATCH /notifications/:id/read
export const markAsRead = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user || {};

        const notification = await Notification.findOne({ _id: id, userId });
        if (!notification) {
            return sendResponse(res, 404, false, "Notification not found");
        }

        notification.isRead = true;
        await notification.save();

        return sendResponse(res, 200, true, "Marked as read");
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

// PATCH /notifications/read-all
export const markAllAsRead = async (req: AuthRequest, res: Response) => {
    try {
        const { id: userId } = req.user || {};

        await Notification.updateMany(
            { userId, isRead: false },
            { isRead: true }
        );

        return sendResponse(res, 200, true, "All notifications marked as read");
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

// GET /system-messages
export const getSystemMessages = async (req: AuthRequest, res: Response) => {
    try {
        const { id: userId } = req.user || {};
        const messages = await Notification.find({ userId, type: 'system' }).sort({ createdAt: -1 });
        return sendResponse(res, 200, true, "System messages fetched successfully", messages);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

