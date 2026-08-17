import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Room } from '../models/room.model';
import { Banner } from '../models/banner.model';
import { Ad } from '../models/ad.model';
import { VipPlan } from '../models/vipPlan.model';
import { PromoCode } from '../models/promoCode.model';
import { Agency } from '../models/agency.model';
import { AuditLog } from '../models/auditLog.model';
import { BlockedWord } from '../models/blockedWord.model';
import { deleteImageFromCloudinary } from '../utils/cloudinary';
import { User } from '../models/user.model';
import { CoinsTransaction } from '../models/spentCoinModel';
import { getIO } from '../sockets';
import sendResponse from '../utils/reponse';
import AppError from '../utils/errorHandler';
import dayjs from 'dayjs';
import HelpRequest from '../models/help.model';
import DeletionRequest from '../models/deletionRequest.model';
import { ActivityEvent, ActivityEventAudience } from '../models/activityEvent.model';

// Helper to log administrative actions
const logAudit = async (req: Request, action: string, target: string, details: string) => {
    try {
        const adminId = (req as any).user?.id;
        const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';
        if (adminId) {
            await AuditLog.create({
                adminId,
                action,
                target,
                ipAddress,
                details
            });
        }
    } catch (err) {
        console.error('Failed to write audit log:', err);
    }
};

// ==================== ROOMS MANAGEMENT ====================

export const getAllRooms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);

        const query: any = {};
        if (search) {
            query.title = { $regex: search, $options: 'i' };
        }

        const rooms = await Room.find(query)
            .populate('ownerId', 'name email userId image')
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .sort({ createdAt: -1 });

        const total = await Room.countDocuments(query);

        return sendResponse(res, 200, true, 'Rooms fetched successfully', {
            rooms,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching rooms', 500));
    }
};

export const createRoom = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { title, ownerId, category, tags } = req.body;
        if (!title || !ownerId) {
            return sendResponse(res, 400, false, 'Title and ownerId are required');
        }

        const channelName = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const room = await Room.create({
            title,
            channelName,
            ownerId,
            category: category || 'General',
            tags: tags || []
        });

        await logAudit(req, 'CREATE_ROOM', room.channelName, `Room title: ${title}`);
        return sendResponse(res, 201, true, 'Room created successfully', room);
    } catch (error: any) {
        next(new AppError(error.message || 'Error creating room', 500));
    }
};

export const toggleLockRoom = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const room = await Room.findById(id);
        if (!room) {
            return sendResponse(res, 404, false, 'Room not found');
        }

        room.isLocked = !room.isLocked;
        await room.save();

        const io = getIO();
        if (io) {
            io.to(room.channelName).emit('roomLocked', { isLocked: room.isLocked });
        }

        await logAudit(req, 'TOGGLE_LOCK_ROOM', room.channelName, `Locked state: ${room.isLocked}`);
        return sendResponse(res, 200, true, `Room successfully ${room.isLocked ? 'locked' : 'unlocked'}`, room);
    } catch (error: any) {
        next(new AppError(error.message || 'Error locking/unlocking room', 500));
    }
};

export const deleteRoom = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const room = await Room.findByIdAndDelete(id);
        if (!room) {
            return sendResponse(res, 404, false, 'Room not found');
        }

        const io = getIO();
        if (io) {
            io.to(room.channelName).emit('roomClosed', { channelName: room.channelName });
        }

        await logAudit(req, 'DELETE_ROOM', room.channelName, `Room title: ${room.title}`);
        return sendResponse(res, 200, true, 'Room deleted successfully', room);
    } catch (error: any) {
        next(new AppError(error.message || 'Error deleting room', 500));
    }
};

export const kickUserFromRoom = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params; // room id
        const { userId } = req.body; // user ID to kick (number or string ID)
        if (!userId) {
            return sendResponse(res, 400, false, 'userId is required');
        }

        const room = await Room.findById(id);
        if (!room) {
            return sendResponse(res, 404, false, 'Room not found');
        }

        const io = getIO();
        if (io) {
            io.to(room.channelName).emit('kickUser', { userId });
        }

        await logAudit(req, 'KICK_USER', room.channelName, `Kicked User ID: ${userId}`);
        return sendResponse(res, 200, true, 'Kick event emitted to room');
    } catch (error: any) {
        next(new AppError(error.message || 'Error kicking user', 500));
    }
};

const canManageActivityEvents = (req: Request) =>
    ['owner', 'operator', 'superAdmin', 'admin'].includes(String((req as any).user?.role));

const activityAudienceFilter = (audience: ActivityEventAudience) => {
    const base: any = { isDeleted: false, isBlocked: { $ne: true }, role: { $in: ['user', 'host'] } };
    if (audience === 'users') base.role = 'user';
    if (audience === 'hosts') base.role = 'host';
    if (audience === 'verified') {
        base.faceVerificationStatus = 'APPROVED';
        base.kycVerificationStatus = 'APPROVED';
    }
    return base;
};

const publishEventToAudience = async (event: any) => {
    const users = await User.find(activityAudienceFilter(event.audience)).select('fcmToken _id').lean();
    const eventData = {
        type: 'event',
        action: 'open_activity',
        eventId: String(event._id),
        rewardCoins: String(event.rewardCoins || 0),
        startAt: event.startAt?.toISOString?.() || String(event.startAt),
        endAt: event.endAt?.toISOString?.() || (event.endAt ? String(event.endAt) : ''),
        imageUrl: event.imageUrl || '',
        actionUrl: event.actionUrl || '',
    };

    if (users.length > 0) {
        const { default: Notification } = await import('../models/notification.model');
        await Notification.insertMany(users.map(user => ({
            userId: user._id,
            title: event.title,
            message: event.description,
            type: 'event',
            data: eventData,
        })), { ordered: false });
        getIO().emit('notification:new', { refresh: true, type: 'event' });
    }

    const tokens = users.map(user => user.fcmToken).filter(Boolean) as string[];
    if (tokens.length > 0) {
        const { sendPushNotification } = await import('../utils/pushNotification');
        for (let i = 0; i < tokens.length; i += 500) {
            await sendPushNotification(tokens.slice(i, i + 500), {
                title: event.title,
                body: event.description,
                data: eventData,
            });
        }
    }

    event.status = 'published';
    event.publishedAt = new Date();
    event.recipientCount = users.length;
    await event.save();
    return users.length;
};

export const getActivityEvents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!canManageActivityEvents(req)) return sendResponse(res, 403, false, 'Admin access required');
        const events = await ActivityEvent.find()
            .populate('createdBy', 'name userId role')
            .sort({ createdAt: -1 })
            .lean();
        return sendResponse(res, 200, true, 'Activity events fetched successfully', events);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching activity events', 500));
    }
};

export const createActivityEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!canManageActivityEvents(req)) return sendResponse(res, 403, false, 'Admin access required');
        const {
            title, description, audience = 'all', rewardCoins = 0,
            imageUrl = '', actionUrl = '', startAt, endAt, publishNow = false,
        } = req.body;
        if (!title?.trim() || !description?.trim() || !startAt) {
            return sendResponse(res, 400, false, 'Title, description and start date are required');
        }
        if (!['all', 'users', 'hosts', 'verified'].includes(audience)) {
            return sendResponse(res, 400, false, 'Invalid event audience');
        }
        if (endAt && new Date(endAt) < new Date(startAt)) {
            return sendResponse(res, 400, false, 'End date must be after start date');
        }

        const event = await ActivityEvent.create({
            title: title.trim(),
            description: description.trim(),
            audience,
            rewardCoins: Math.max(0, Number(rewardCoins) || 0),
            imageUrl: imageUrl.trim(),
            actionUrl: actionUrl.trim(),
            startAt: new Date(startAt),
            endAt: endAt ? new Date(endAt) : undefined,
            createdBy: (req as any).user.id,
        });
        let recipients = 0;
        if (publishNow) recipients = await publishEventToAudience(event);
        await logAudit(req, publishNow ? 'CREATE_PUBLISH_EVENT' : 'CREATE_EVENT', String(event._id), event.title);
        return sendResponse(res, 201, true, publishNow ? `Event published to ${recipients} users` : 'Event saved as draft', event);
    } catch (error: any) {
        next(new AppError(error.message || 'Error creating activity event', 500));
    }
};

export const publishActivityEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!canManageActivityEvents(req)) return sendResponse(res, 403, false, 'Admin access required');
        const event = await ActivityEvent.findById(req.params.id);
        if (!event) return sendResponse(res, 404, false, 'Event not found');
        if (event.status === 'published') return sendResponse(res, 409, false, 'Event is already published');
        if (event.status === 'closed') return sendResponse(res, 409, false, 'Closed event cannot be published');
        const recipients = await publishEventToAudience(event);
        await logAudit(req, 'PUBLISH_EVENT', String(event._id), `${event.title}; recipients=${recipients}`);
        return sendResponse(res, 200, true, `Event published to ${recipients} users`, event);
    } catch (error: any) {
        next(new AppError(error.message || 'Error publishing activity event', 500));
    }
};

export const closeActivityEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!canManageActivityEvents(req)) return sendResponse(res, 403, false, 'Admin access required');
        const event = await ActivityEvent.findById(req.params.id);
        if (!event) return sendResponse(res, 404, false, 'Event not found');
        event.status = 'closed';
        event.closedAt = new Date();
        await event.save();
        await logAudit(req, 'CLOSE_EVENT', String(event._id), event.title);
        return sendResponse(res, 200, true, 'Event closed successfully', event);
    } catch (error: any) {
        next(new AppError(error.message || 'Error closing activity event', 500));
    }
};

export const broadcastEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!canManageActivityEvents(req)) return sendResponse(res, 403, false, 'Admin access required');
        const {
            title, body, description, audience = 'all', rewardCoins = 0,
            imageUrl = '', actionUrl = '', startAt, endAt,
        } = req.body;
        const eventDescription = description || body;
        if (!title?.trim() || !eventDescription?.trim()) {
            return sendResponse(res, 400, false, 'Title and message are required for event broadcast');
        }
        if (!['all', 'users', 'hosts', 'verified'].includes(audience)) {
            return sendResponse(res, 400, false, 'Invalid event audience');
        }
        const event = await ActivityEvent.create({
            title: title.trim(),
            description: eventDescription.trim(),
            audience,
            rewardCoins: Math.max(0, Number(rewardCoins) || 0),
            imageUrl: imageUrl.trim(),
            actionUrl: actionUrl.trim(),
            startAt: startAt ? new Date(startAt) : new Date(),
            endAt: endAt ? new Date(endAt) : undefined,
            createdBy: (req as any).user.id,
        });
        const recipients = await publishEventToAudience(event);
        await logAudit(req, 'BROADCAST_EVENT', String(event._id), `${event.title}; recipients=${recipients}`);
        return sendResponse(res, 200, true, `Activity message sent to ${recipients} users`, event);
    } catch (error: any) {
        next(new AppError(error.message || 'Error broadcasting event', 500));
    }
};

export const muteUserInRoom = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { userId, isMuted = true } = req.body;
        if (!userId) {
            return sendResponse(res, 400, false, 'userId is required');
        }

        const room = await Room.findById(id);
        if (!room) {
            return sendResponse(res, 404, false, 'Room not found');
        }

        const io = getIO();
        if (io) {
            io.to(room.channelName).emit('muteUser', { userId, isMuted });
        }

        await logAudit(req, 'MUTE_USER', room.channelName, `${isMuted ? 'Muted' : 'Unmuted'} User ID: ${userId}`);
        return sendResponse(res, 200, true, `User successfully ${isMuted ? 'muted' : 'unmuted'} inside room`);
    } catch (error: any) {
        next(new AppError(error.message || 'Error muting user', 500));
    }
};


const BANNER_INTERNAL_SCREENS = new Set([
    'Wallet', 'Recharge', 'Level', 'Frame', 'Withdrawal', 'Kyc', 'VerificationHub',
    'HelpAndSupport', 'Notifications', 'SystemMessage', 'CallHistory', 'Earning',
    'ExchangeCoins', 'HostApply', 'Setting', 'Profile',
]);

// ==================== BANNERS MANAGEMENT ====================

export const getAllBanners = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const banners = await Banner.find().sort({ priority: -1, createdAt: -1 });
        return sendResponse(res, 200, true, 'Banners fetched successfully', banners);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching banners', 500));
    }
};

export const createBanner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { title, imageUrl, linkUrl, targetType = linkUrl ? 'external' : 'none', targetScreen, priority, startDate, endDate, isActive = true } = req.body;
        if (!title || !imageUrl) {
            return sendResponse(res, 400, false, 'Title and imageUrl are required');
        }

        if (targetType === 'internal' && !BANNER_INTERNAL_SCREENS.has(String(targetScreen))) {
            return sendResponse(res, 400, false, 'Invalid internal app page');
        }
        if (targetType === 'external' && linkUrl && !/^https?:\/\//i.test(String(linkUrl))) {
            return sendResponse(res, 400, false, 'External banner URL must start with http:// or https://');
        }

        const parsedStartDate = startDate ? new Date(startDate) : undefined;
        const parsedEndDate = endDate ? new Date(endDate) : undefined;

        if (parsedStartDate && parsedEndDate && parsedEndDate.getTime() < parsedStartDate.getTime()) {
            return sendResponse(res, 400, false, 'Expiry date cannot be before start date');
        }

        const banner = await Banner.create({
            title,
            imageUrl,
            linkUrl: targetType === 'external' ? (linkUrl || '') : '',
            targetType,
            targetScreen: targetType === 'internal' ? targetScreen : '',
            priority: priority ? parseInt(priority) : 0,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            isActive: Boolean(isActive)
        });

        await logAudit(req, 'CREATE_BANNER', (banner as any)._id.toString(), `Banner title: ${title}`);
        return sendResponse(res, 201, true, 'Banner created successfully', banner);
    } catch (error: any) {
        next(new AppError(error.message || 'Error creating banner', 500));
    }
};

export const deleteBanner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const banner = await Banner.findByIdAndDelete(id);
        if (!banner) {
            return sendResponse(res, 404, false, 'Banner not found');
        }

        if (banner.imageUrl) {
            deleteImageFromCloudinary(banner.imageUrl).catch(err => {
                console.warn('Cloudinary image cleanup notice:', err?.message || err);
            });
        }

        await logAudit(req, 'DELETE_BANNER', (banner as any)._id.toString(), `Banner title: ${banner.title}`);
        return sendResponse(res, 200, true, 'Banner deleted successfully', banner);
    } catch (error: any) {
        next(new AppError(error.message || 'Error deleting banner', 500));
    }
};

export const updateBannerPriority = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { title, imageUrl, linkUrl, targetType, targetScreen, priority, startDate, endDate, isActive } = req.body;

        const banner = await Banner.findById(id);
        if (!banner) {
            return sendResponse(res, 404, false, 'Banner not found');
        }

        if (title !== undefined) banner.title = title;
        if (imageUrl !== undefined) banner.imageUrl = imageUrl;
        if (linkUrl !== undefined) banner.linkUrl = linkUrl;
        if (targetType !== undefined) {
            if (!['none', 'internal', 'external'].includes(targetType)) return sendResponse(res, 400, false, 'Invalid banner target type');
            if (targetType === 'internal' && !BANNER_INTERNAL_SCREENS.has(String(targetScreen))) return sendResponse(res, 400, false, 'Invalid internal app page');
            if (targetType === 'external' && linkUrl && !/^https?:\/\//i.test(String(linkUrl))) return sendResponse(res, 400, false, 'External banner URL must start with http:// or https://');
            banner.targetType = targetType;
            banner.targetScreen = targetType === 'internal' ? String(targetScreen) : '';
            banner.linkUrl = targetType === 'external' ? String(linkUrl || '') : '';
        }
        if (priority !== undefined) banner.priority = parseInt(priority);
        if (startDate !== undefined) banner.startDate = startDate ? new Date(startDate) : undefined;
        if (endDate !== undefined) banner.endDate = endDate ? new Date(endDate) : undefined;
        if (isActive !== undefined) banner.isActive = Boolean(isActive);

        if (banner.startDate && banner.endDate && banner.endDate.getTime() < banner.startDate.getTime()) {
            return sendResponse(res, 400, false, 'Expiry date cannot be before start date');
        }

        await banner.save();

        await logAudit(req, 'UPDATE_BANNER', (banner as any)._id.toString(), `Priority: ${banner.priority}, Active: ${banner.isActive}`);
        return sendResponse(res, 200, true, 'Banner updated successfully', banner);
    } catch (error: any) {
        next(new AppError(error.message || 'Error updating banner', 500));
    }
};

export const updateBanner = updateBannerPriority;

export const toggleBannerActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const banner = await Banner.findById(id);
        if (!banner) {
            return sendResponse(res, 404, false, 'Banner not found');
        }

        banner.isActive = !banner.isActive;
        await banner.save();

        await logAudit(req, 'TOGGLE_BANNER', (banner as any)._id.toString(), `New active state: ${banner.isActive}`);
        return sendResponse(res, 200, true, `Banner ${banner.isActive ? 'activated' : 'deactivated'} successfully`, banner);
    } catch (error: any) {
        next(new AppError(error.message || 'Error toggling banner state', 500));
    }
};


// ==================== ADS MANAGEMENT ====================

export const getAllAds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const ads = await Ad.find().sort({ priority: -1, createdAt: -1 });
        return sendResponse(res, 200, true, 'Ads fetched successfully', ads);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching ads', 500));
    }
};

export const createAd = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { title, type, provider, adUnitId, priority } = req.body;
        if (!title || !type || !adUnitId) {
            return sendResponse(res, 400, false, 'Title, type, and adUnitId are required');
        }

        const ad = await Ad.create({
            title,
            type,
            provider: provider || 'admob',
            adUnitId,
            priority: priority ? parseInt(priority) : 0
        });

        await logAudit(req, 'CREATE_AD', (ad as any)._id.toString(), `Ad title: ${title}`);
        return sendResponse(res, 201, true, 'Ad configuration created successfully', ad);
    } catch (error: any) {
        next(new AppError(error.message || 'Error creating ad config', 500));
    }
};

export const deleteAd = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const ad = await Ad.findByIdAndDelete(id);
        if (!ad) {
            return sendResponse(res, 404, false, 'Ad configuration not found');
        }

        await logAudit(req, 'DELETE_AD', (ad as any)._id.toString(), `Ad title: ${ad.title}`);
        return sendResponse(res, 200, true, 'Ad configuration deleted successfully', ad);
    } catch (error: any) {
        next(new AppError(error.message || 'Error deleting ad config', 500));
    }
};

export const updateAd = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { isActive, priority, adUnitId } = req.body;

        const ad = await Ad.findById(id);
        if (!ad) {
            return sendResponse(res, 404, false, 'Ad configuration not found');
        }

        if (isActive !== undefined) ad.isActive = isActive;
        if (priority !== undefined) ad.priority = parseInt(priority);
        if (adUnitId !== undefined) ad.adUnitId = adUnitId;

        await ad.save();

        await logAudit(req, 'UPDATE_AD', (ad as any)._id.toString(), `Active: ${isActive}, Priority: ${priority}`);
        return sendResponse(res, 200, true, 'Ad configuration updated successfully', ad);
    } catch (error: any) {
        next(new AppError(error.message || 'Error updating ad config', 500));
    }
};


// ==================== REFERRALS & PROMO CODES ====================

export const getReferralStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Mock aggregates of referrals for SaaS analytics
        const totalReferrals = await User.countDocuments({ createdBy: { $ne: null } });
        const convertedVIPs = await User.countDocuments({ createdBy: { $ne: null }, level: { $gte: 10 } });

        const stats = {
            totalReferrals,
            convertedVIPs,
            totalReferralPayouts: totalReferrals * 5.0, // Mock calculation
            analytics: [
                { date: dayjs().subtract(6, 'day').format('YYYY-MM-DD'), invites: 12, conversions: 2 },
                { date: dayjs().subtract(5, 'day').format('YYYY-MM-DD'), invites: 19, conversions: 5 },
                { date: dayjs().subtract(4, 'day').format('YYYY-MM-DD'), invites: 15, conversions: 4 },
                { date: dayjs().subtract(3, 'day').format('YYYY-MM-DD'), invites: 25, conversions: 8 },
                { date: dayjs().subtract(2, 'day').format('YYYY-MM-DD'), invites: 22, conversions: 7 },
                { date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'), invites: 30, conversions: 11 },
                { date: dayjs().format('YYYY-MM-DD'), invites: 34, conversions: 14 }
            ]
        };

        return sendResponse(res, 200, true, 'Referral stats fetched successfully', stats);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching referral stats', 500));
    }
};

export const getPromoCodes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const codes = await PromoCode.find().sort({ createdAt: -1 });
        return sendResponse(res, 200, true, 'Promo codes fetched successfully', codes);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching promo codes', 500));
    }
};

export const createPromoCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { code, rewardCoins, usageLimit, expiresAt } = req.body;
        if (!code || !rewardCoins) {
            return sendResponse(res, 400, false, 'Code and rewardCoins are required');
        }

        const promoCode = await PromoCode.create({
            code: code.toUpperCase(),
            rewardCoins: parseInt(rewardCoins),
            usageLimit: usageLimit ? parseInt(usageLimit) : 100,
            expiresAt: expiresAt ? new Date(expiresAt) : undefined
        });

        await logAudit(req, 'CREATE_PROMO_CODE', promoCode.code, `Reward coins: ${rewardCoins}`);
        return sendResponse(res, 201, true, 'Promo code created successfully', promoCode);
    } catch (error: any) {
        next(new AppError(error.message || 'Error creating promo code', 500));
    }
};

export const deletePromoCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const promoCode = await PromoCode.findByIdAndDelete(id);
        if (!promoCode) {
            return sendResponse(res, 404, false, 'Promo code not found');
        }

        await logAudit(req, 'DELETE_PROMO_CODE', promoCode.code, `Code: ${promoCode.code}`);
        return sendResponse(res, 200, true, 'Promo code deleted successfully', promoCode);
    } catch (error: any) {
        next(new AppError(error.message || 'Error deleting promo code', 500));
    }
};


// ==================== VIP PROGRAM MANAGEMENT ====================

export const getVipPlans = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const plans = await VipPlan.find().sort({ price: 1 });
        return sendResponse(res, 200, true, 'VIP plans fetched successfully', plans);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching VIP plans', 500));
    }
};

export const createVipPlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { name, durationDays, coinsCost, price, benefits } = req.body;
        if (!name || !price) {
            return sendResponse(res, 400, false, 'Name and price are required');
        }

        const plan = await VipPlan.create({
            name,
            durationDays: durationDays ? parseInt(durationDays) : 30,
            coinsCost: coinsCost ? parseInt(coinsCost) : 0,
            price: parseFloat(price),
            benefits: benefits || []
        });

        await logAudit(req, 'CREATE_VIP_PLAN', (plan as any)._id.toString(), `Plan: ${name}, Price: $${price}`);
        return sendResponse(res, 201, true, 'VIP plan created successfully', plan);
    } catch (error: any) {
        next(new AppError(error.message || 'Error creating VIP plan', 500));
    }
};

export const deleteVipPlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const plan = await VipPlan.findByIdAndDelete(id);
        if (!plan) {
            return sendResponse(res, 404, false, 'VIP plan not found');
        }

        await logAudit(req, 'DELETE_VIP_PLAN', (plan as any)._id.toString(), `Plan: ${plan.name}`);
        return sendResponse(res, 200, true, 'VIP plan deleted successfully', plan);
    } catch (error: any) {
        next(new AppError(error.message || 'Error deleting VIP plan', 500));
    }
};

export const getVipSubscribers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Fetch users holding high levels or VIP features (in this case users with level >= 10 as VIPs)
        const subscribers = await User.find({ level: { $gte: 10 }, isDeleted: false })
            .select('name email userId coins level image createdAt')
            .sort({ level: -1 });

        return sendResponse(res, 200, true, 'VIP subscribers fetched successfully', subscribers);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching VIP subscribers', 500));
    }
};


// ==================== AGENCY MANAGEMENT ====================

export const getAllAgencies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const adminUser = (req as any).user;
        const adminRole = adminUser?.role;
        const adminMongoId = adminUser?.id;

        // Auto-sync active User entries with role='agency' into Agency collection if missing
        try {
            const agencyUsers = await User.find({ role: { $in: ['agency', 'agency-admin'] }, isDeleted: false });
            for (const u of agencyUsers) {
                const exists = await Agency.findOne({ ownerId: u._id });
                if (!exists) {
                    const code = u.referralCode || u.specialCode || `AGY-${Math.floor(10000 + Math.random() * 90000)}`;
                    await Agency.create({
                        name: (u as any).agencyName || u.name || 'Agency',
                        code,
                        ownerId: u._id,
                        logo: (u as any).agencyLogo || u.image || '',
                        commissionRate: 10,
                        status: u.isBlocked ? 'blocked' : 'active',
                        balance: 0
                    });
                }
            }
        } catch (syncErr) {
            console.error('Agency auto-sync error:', syncErr);
        }

        const query: any = {};
        // Data isolation: admin/agency only see their own sub-agencies
        if (adminRole === 'agency') {
            // Find agencies whose owner was referred by this admin
            const mySubUsers = await User.find({ referredBy: adminMongoId, isDeleted: false }).select('_id');
            const mySubIds = mySubUsers.map(u => u._id);
            query.ownerId = { $in: mySubIds };
        }

        const agencies = await Agency.find(query)
            .populate('ownerId', 'name email userId phoneNumber image agencyLogo referralCode specialCode')
            .sort({ createdAt: -1 });

        return sendResponse(res, 200, true, 'Agencies fetched successfully', agencies);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching agencies', 500));
    }
};

export const createAgency = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { name, ownerId, commissionRate, logo, agencyLogo } = req.body;
        if (!name || !ownerId) {
            return sendResponse(res, 400, false, 'Name and ownerId are required');
        }

        const logoUrl = logo || agencyLogo || '';
        // Auto-generate a unique code
        const code = `AGY-${Math.floor(10000 + Math.random() * 90000)}`;

        const agency = await Agency.create({
            name,
            code,
            ownerId,
            logo: logoUrl,
            commissionRate: commissionRate ? parseFloat(commissionRate) : 10
        });

        // Set the owner role as an agency-level admin so it stays separate from standard admins.
        await User.findByIdAndUpdate(ownerId, {
            role: 'agency',
            agencyName: name,
            ...(logoUrl ? { agencyLogo: logoUrl, image: logoUrl } : {})
        });

        await logAudit(req, 'CREATE_AGENCY', agency.code, `Agency Name: ${name}`);
        return sendResponse(res, 201, true, 'Agency profile created successfully', agency);
    } catch (error: any) {
        next(new AppError(error.message || 'Error creating agency', 500));
    }
};

export const blockAgency = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const agency = await Agency.findById(id);
        if (!agency) {
            return sendResponse(res, 404, false, 'Agency profile not found');
        }

        agency.status = agency.status === 'active' ? 'blocked' : 'active';
        await agency.save();

        await logAudit(req, 'BLOCK_AGENCY', agency.code, `Status: ${agency.status}`);
        return sendResponse(res, 200, true, `Agency successfully ${agency.status}`, agency);
    } catch (error: any) {
        next(new AppError(error.message || 'Error blocking/unblocking agency', 500));
    }
};

export const assignHostToAgency = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { agencyId, hostUserId } = req.body;
        if (!agencyId || !hostUserId) {
            return sendResponse(res, 400, false, 'agencyId and hostUserId are required');
        }

        const agency = await Agency.findById(agencyId);
        if (!agency) {
            return sendResponse(res, 404, false, 'Agency profile not found');
        }

        // In this app, agency hosts link by setting user's meethiId to the agency code or owner's meethiId
        const hostUser = await User.findOneAndUpdate(
            { userId: hostUserId, role: 'host' },
            { meethiId: agency.code },
            { new: true }
        );

        if (!hostUser) {
            return sendResponse(res, 404, false, 'Approved Host user not found with specified ID');
        }

        await logAudit(req, 'ASSIGN_HOST', agency.code, `Assigned Host userId: ${hostUserId}`);
        return sendResponse(res, 200, true, `Host successfully assigned to Agency: ${agency.name}`, hostUser);
    } catch (error: any) {
        next(new AppError(error.message || 'Error assigning host to agency', 500));
    }
};


// ==================== CONTENT MODERATION ====================

export const getBlockedWords = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const words = await BlockedWord.find().sort({ word: 1 });
        return sendResponse(res, 200, true, 'Blocked words fetched successfully', words);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching blocked words', 500));
    }
};

export const addBlockedWord = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { word } = req.body;
        if (!word) {
            return sendResponse(res, 400, false, 'Word is required');
        }

        const cleanWord = word.trim().toLowerCase();
        // Check if exists
        const existing = await BlockedWord.findOne({ word: cleanWord });
        if (existing) {
            return sendResponse(res, 400, false, 'Blocked word already exists');
        }

        const wordDoc = await BlockedWord.create({ word: cleanWord });

        await logAudit(req, 'ADD_BLOCKED_WORD', cleanWord, `Banned word: ${cleanWord}`);
        return sendResponse(res, 201, true, 'Blocked word added successfully', wordDoc);
    } catch (error: any) {
        next(new AppError(error.message || 'Error blocking word', 500));
    }
};

export const deleteBlockedWord = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const wordDoc = await BlockedWord.findByIdAndDelete(id);
        if (!wordDoc) {
            return sendResponse(res, 404, false, 'Blocked word not found');
        }

        await logAudit(req, 'DELETE_BLOCKED_WORD', wordDoc.word, `Removed word: ${wordDoc.word}`);
        return sendResponse(res, 200, true, 'Blocked word removed successfully', wordDoc);
    } catch (error: any) {
        next(new AppError(error.message || 'Error deleting blocked word', 500));
    }
};


// ==================== SECURITY & LOGS ====================

export const getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const logs = await AuditLog.find()
            .populate('adminId', 'name email userId image')
            .sort({ createdAt: -1 })
            .limit(100);

        return sendResponse(res, 200, true, 'Audit logs fetched successfully', logs);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching audit logs', 500));
    }
};

export const getSystemLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Mock server console/error logs aggregation for management panel
        const mockLogs = [
            { timestamp: new Date(), level: 'INFO', message: 'MithiChat Server initialized on Port 3001' },
            { timestamp: new Date(Date.now() - 60000), level: 'INFO', message: 'MongoDB connection established successfully' },
            { timestamp: new Date(Date.now() - 120000), level: 'INFO', message: 'Redis adapter listening on port 6379' },
            { timestamp: new Date(Date.now() - 300000), level: 'WARN', message: 'Firebase service account path config not set, running in offline mode' },
            { timestamp: new Date(Date.now() - 1000 * 3600), level: 'INFO', message: 'StartCallCleanupJob Cron job fired successfully' }
        ];

        return sendResponse(res, 200, true, 'System logs fetched successfully', mockLogs);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching system logs', 500));
    }
};

export const getHelpTickets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { search = '', status = '' } = req.query;
        const adminUser = (req as any).user;
        const adminRole = adminUser?.role;
        const adminMongoId = adminUser?.id;

        const query: any = {};
        if (status) {
            query.status = status;
        }
        if (search) {
            query.$or = [
                { reason: { $regex: search, $options: 'i' } },
                { message: { $regex: search, $options: 'i' } },
                { ticketNumber: { $regex: search, $options: 'i' } }
            ];
        }

        // Data isolation: admins only see tickets from their sub-users
        if (adminRole === 'agency') {
            const mySubUsers = await User.find({ referredBy: adminMongoId, isDeleted: false }).select('userId');
            const mySubUserIds = mySubUsers.map(u => u.userId);
            query.userId = { $in: mySubUserIds };
        }

        const tickets = await HelpRequest.find(query).sort({ createdAt: -1 }).lean();
        const userIds = [...new Set(tickets.map(ticket => Number(ticket.userId)).filter(Number.isFinite))];
        const users = await User.find({ userId: { $in: userIds } })
            .select('name email userId image role meethiId employeeCode')
            .lean();
        const usersById = new Map(users.map(user => [Number(user.userId), user]));
        const enrichedTickets = tickets.map(ticket => ({
            ...ticket,
            user: usersById.get(Number(ticket.userId)) || null,
        }));
        return sendResponse(res, 200, true, 'Help tickets fetched successfully', enrichedTickets);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching help tickets', 500));
    }
};

export const replyHelpTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { reply, status } = req.body;
        if (!reply) {
            return sendResponse(res, 400, false, 'Reply text is required');
        }

        const ticket = await HelpRequest.findById(id);
        if (!ticket) {
            return sendResponse(res, 404, false, 'Help ticket not found');
        }

        // Push admin reply to thread
        ticket.replies.push({ sender: 'admin', message: reply, createdAt: new Date() } as any);
        ticket.adminReply = reply;
        ticket.status = status || 'resolved';
        await ticket.save();

        await logAudit(req, 'REPLY_HELP_TICKET', String(ticket._id), `Reply: ${reply}`);
        return sendResponse(res, 200, true, 'Help ticket replied successfully', ticket);
    } catch (error: any) {
        next(new AppError(error.message || 'Error replying to help ticket', 500));
    }
};

export const getDeletionRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const requests = await DeletionRequest.find().sort({ createdAt: -1 });
        return sendResponse(res, 200, true, 'Deletion requests fetched successfully', requests);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching deletion requests', 500));
    }
};

export const processDeletionRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { action } = req.body; // 'approve' | 'reject'
        if (!['approve', 'reject'].includes(action)) {
            return sendResponse(res, 400, false, 'Action must be approve or reject');
        }

        const delReq = await DeletionRequest.findById(id);
        if (!delReq) {
            return sendResponse(res, 404, false, 'Deletion request not found');
        }

        if (action === 'approve') {
            delReq.status = 'approved';
            await delReq.save();

            // Find user and soft-delete them
            const user = await User.findById(delReq.userId);
            if (user) {
                const suffix = `_deleted_${Date.now()}`;
                if (user.phoneNumber) user.phoneNumber = user.phoneNumber + suffix;
                if (user.email) user.email = user.email + suffix;
                if (user.userName) user.userName = user.userName + suffix;
                user.isDeleted = true;
                await user.save();
            }

            await logAudit(req, 'APPROVE_DELETION', String(delReq.userId), `Approved deletion request ID: ${id}`);
            return sendResponse(res, 200, true, 'User deletion approved and soft deleted successfully');
        } else {
            delReq.status = 'rejected';
            await delReq.save();

            await logAudit(req, 'REJECT_DELETION', String(delReq.userId), `Rejected deletion request ID: ${id}`);
            return sendResponse(res, 200, true, 'User deletion request rejected successfully');
        }
    } catch (error: any) {
        next(new AppError(error.message || 'Error processing deletion request', 500));
    }
};

export const triggerWeeklyLevelRecalculation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { runWeeklyHostLevelRecalculation } = await import('../services/user.service');
        const summary = await runWeeklyHostLevelRecalculation();
        await logAudit(req, 'TRIGGER_WEEKLY_LEVEL_RECALCULATION', 'SYSTEM', `Recalculated host levels: Upgraded ${summary.upgraded}, Downgraded ${summary.downgraded}, Unchanged ${summary.unchanged}`);
        return sendResponse(res, 200, true, 'Weekly host level recalculation triggered successfully', summary);
    } catch (error: any) {
        next(new AppError(error.message || 'Error executing weekly level recalculation', 500));
    }
};
