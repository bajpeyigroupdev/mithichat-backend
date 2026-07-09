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
import { User } from '../models/user.model';
import { CoinsTransaction } from '../models/spentCoinModel';
import { getIO } from '../sockets';
import sendResponse from '../utils/reponse';
import AppError from '../utils/errorHandler';
import dayjs from 'dayjs';

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
        const { title, imageUrl, linkUrl, priority, startDate, endDate } = req.body;
        if (!title || !imageUrl) {
            return sendResponse(res, 400, false, 'Title and imageUrl are required');
        }

        const banner = await Banner.create({
            title,
            imageUrl,
            linkUrl: linkUrl || '',
            priority: priority ? parseInt(priority) : 0,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined
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

        await logAudit(req, 'DELETE_BANNER', (banner as any)._id.toString(), `Banner title: ${banner.title}`);
        return sendResponse(res, 200, true, 'Banner deleted successfully', banner);
    } catch (error: any) {
        next(new AppError(error.message || 'Error deleting banner', 500));
    }
};

export const updateBannerPriority = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { priority, isActive } = req.body;

        const banner = await Banner.findById(id);
        if (!banner) {
            return sendResponse(res, 404, false, 'Banner not found');
        }

        if (priority !== undefined) banner.priority = parseInt(priority);
        if (isActive !== undefined) banner.isActive = isActive;

        await banner.save();

        await logAudit(req, 'UPDATE_BANNER', (banner as any)._id.toString(), `Priority: ${priority}, Active: ${isActive}`);
        return sendResponse(res, 200, true, 'Banner updated successfully', banner);
    } catch (error: any) {
        next(new AppError(error.message || 'Error updating banner', 500));
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
        const agencies = await Agency.find()
            .populate('ownerId', 'name email userId image')
            .sort({ createdAt: -1 });

        return sendResponse(res, 200, true, 'Agencies fetched successfully', agencies);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching agencies', 500));
    }
};

export const createAgency = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { name, ownerId, commissionRate } = req.body;
        if (!name || !ownerId) {
            return sendResponse(res, 400, false, 'Name and ownerId are required');
        }

        // Auto-generate a unique code
        const code = `AGE${Math.floor(1000 + Math.random() * 9000)}`;

        const agency = await Agency.create({
            name,
            code,
            ownerId,
            commissionRate: commissionRate ? parseFloat(commissionRate) : 10
        });

        // Set the owner role as host/admin if required
        await User.findByIdAndUpdate(ownerId, { role: 'admin' });

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
