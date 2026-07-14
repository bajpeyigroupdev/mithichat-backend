import express, { Request, Response } from 'express';
import { getCachedSettings } from '../controllers/settingsController';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';
import { Banner } from '../models/banner.model';

const router = express.Router();

router.get('/settings', async (req: Request, res: Response) => {
    try {
        const settings = await getCachedSettings();
        
        // Return ONLY public/legal fields
        const publicSettings = {
            privacyPolicy: settings.privacyPolicy,
            termsAndConditions: settings.termsAndConditions,
            coinPrice: settings.coinPrice, // often needed publically
        };

        return sendResponse(res, 200, true, 'Settings fetched successfully', publicSettings);
    } catch (error) {
        await Logger('getPublicSettings', error);
        return sendResponse(res, 500, false, 'Error fetching settings');
    }
});

router.get('/banners', async (_req: Request, res: Response) => {
    try {
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const banners = await Banner.find({
            $and: [
                // Banners created before isActive was introduced are active by default.
                { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
                { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
                // Date-only values are stored at midnight. Keep them visible for
                // the complete selected expiry day instead of hiding at 00:00.
                { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: startOfToday } }] }
            ]
        }).select('_id title imageUrl linkUrl priority').sort({ priority: -1, createdAt: -1 }).lean();

        return sendResponse(res, 200, true, 'Active banners fetched successfully', banners);
    } catch (error) {
        await Logger('getPublicBanners', error);
        return sendResponse(res, 500, false, 'Error fetching banners');
    }
});

export default router;
