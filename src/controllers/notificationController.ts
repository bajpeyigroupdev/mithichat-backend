import { Response } from "express";
import Notification from "../models/notification.model";
import { User } from "../models/user.model";
import sendResponse from "../utils/reponse";
import { AuthRequest } from "../middlewares/authorize.middleware";
import { getIO, getUserRoom } from "../sockets";

// Helper to create notification internally
export const createNotification = async (
    userId: string,
    title: string,
    message: string,
    type: 'system' | 'promo' | 'transaction' | 'call' = 'system',
    data: Record<string, unknown> = {}
) => {
    try {
        const notification = await Notification.create({
            userId,
            title,
            message,
            type,
            data,
        });
        const unreadCount = await Notification.countDocuments({ userId, isRead: false });
        try {
            getIO().to(getUserRoom(String(userId))).emit("notification:new", {
                notification,
                unreadCount,
            });
        } catch (socketError) {
            console.warn("Notification saved; live socket update deferred", socketError);
        }
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

// POST /api/admin/system-messages OR /api/notifications/send-system
export const sendSystemNotification = async (req: AuthRequest, res: Response) => {
    try {
        const { title, message, content, targetGroup = 'all' } = req.body;
        const msgText = message || content;
        if (!title || !msgText) {
            return sendResponse(res, 400, false, "Title and message content are required");
        }

        let query: any = {};
        if (targetGroup === 'hosts') {
            query.role = 'host';
        } else if (targetGroup === 'vip') {
            query.isVip = true;
        } else if (targetGroup === 'sellers') {
            query.role = 'seller';
        }

        const users: any[] = await User.find(query).select('_id fcmToken').lean();
        if (!users.length) {
            return sendResponse(res, 404, false, "No target users found for this group filter");
        }

        const notificationDocs = users.map((u: any) => ({
            userId: u._id,
            title,
            message: msgText,
            type: 'system',
            data: { targetGroup, sentAt: new Date().toISOString() },
            isRead: false
        }));

        await Notification.insertMany(notificationDocs);

        // Emit socket notification to online target users & collect FCM tokens
        const io = getIO();
        const fcmTokens: string[] = [];

        users.forEach((u: any) => {
            if (u.fcmToken) {
                fcmTokens.push(u.fcmToken);
            }
            try {
                io.to(getUserRoom(String(u._id))).emit("notification:new", {
                    title,
                    message: msgText,
                    type: "system",
                    createdAt: new Date().toISOString()
                });
            } catch (err) {}
        });

        // Trigger FCM push notification asynchronously
        if (fcmTokens.length > 0) {
            const { sendPushNotification } = require('../utils/pushNotification');
            sendPushNotification(fcmTokens, {
                title,
                body: msgText,
                type: 'system'
            }).catch((err: any) => console.warn('FCM Push broadcast notice:', err.message));
        }

        return sendResponse(res, 200, true, `System message successfully dispatched to ${users.length} users!`, {
            recipientCount: users.length,
            targetGroup
        });
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

