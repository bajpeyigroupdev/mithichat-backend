import { Request, Response, NextFunction } from 'express';
import HostLevel from '../models/hostLevel.model';
import sendResponse from '../utils/reponse';
import AppError from '../utils/errorHandler';
import { Logger } from '../utils/logger';

// GET all levels (sorted by level number)
export const getLevels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const now = new Date();
        const levels = await HostLevel.find({
            $or: [
                { expiresAt: { $exists: false } },
                { expiresAt: null },
                { expiresAt: { $gt: now } }
            ]
        }).sort({ level: 1 });
        return sendResponse(res, 200, true, 'Levels fetched successfully', levels);
    } catch (error) {
        await Logger('getLevels', error);
        next(new AppError('Error fetching levels', 500));
    }
};

// CREATE a new level
export const createLevel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { level, name, minCalls, minMinutes, coinPerMinute, image } = req.body;

        if (!level || !name || coinPerMinute === undefined) {
            return next(new AppError('level, name, and coinPerMinute are required', 400));
        }

        const existing = await HostLevel.findOne({ level });
        if (existing) {
            return next(new AppError(`Level ${level} already exists`, 409));
        }

        const newLevel = await HostLevel.create({
            level,
            name,
            minCalls: minCalls || 0,
            minMinutes: minMinutes || 0,
            coinPerMinute,
            image,
        });

        return sendResponse(res, 201, true, 'Level created successfully', newLevel);
    } catch (error) {
        await Logger('createLevel', error);
        next(new AppError('Error creating level', 500));
    }
};

// UPDATE a level
export const updateLevel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { name, minCalls, minMinutes, coinPerMinute, image } = req.body;

        const updated = await HostLevel.findByIdAndUpdate(
            id,
            { name, minCalls, minMinutes, coinPerMinute, image },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return next(new AppError('Level not found', 404));
        }

        return sendResponse(res, 200, true, 'Level updated successfully', updated);
    } catch (error) {
        await Logger('updateLevel', error);
        next(new AppError('Error updating level', 500));
    }
};

// DELETE a level
export const deleteLevel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const deleted = await HostLevel.findByIdAndDelete(id);

        if (!deleted) {
            return next(new AppError('Level not found', 404));
        }

        return sendResponse(res, 200, true, 'Level deleted successfully', null);
    } catch (error) {
        await Logger('deleteLevel', error);
        next(new AppError('Error deleting level', 500));
    }
};
