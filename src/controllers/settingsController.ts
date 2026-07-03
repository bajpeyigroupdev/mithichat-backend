import { Request, Response, NextFunction } from 'express';
import { Settings } from '../models/settings.model';
import sendResponse from '../utils/reponse';
import AppError from '../utils/errorHandler';
import { Logger } from '../utils/logger';
import { cacheService } from '../utils/cache';

// Helper function for internal usage to get cached settings
export const getCachedSettings = async () => {
    return cacheService.getOrSet('global_settings', async () => {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        return settings;
    });
};

export const getSettings = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const settings = await getCachedSettings();

        // 🟢 Notice how the code doesn't wait if it's cached!
        return sendResponse(res, 200, true, 'Settings fetched successfully', settings);
    } catch (error) {
        await Logger('getSettings', error);
        next(new AppError('Error fetching settings', 500));
    }
};

export const updateSettings = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const updates = req.body;

        const settings = await Settings.findOneAndUpdate(
            {},
            updates,
            { new: true, upsert: true }
        );

        // 🗑️ Invalidate the cache whenever settings change
        cacheService.del('global_settings');

        return sendResponse(res, 200, true, 'Settings updated successfully', settings);
    } catch (error) {
        await Logger('updateSettings', error);
        next(new AppError('Error updating settings', 500));
    }
};
