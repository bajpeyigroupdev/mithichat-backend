import { Request, Response, NextFunction } from 'express';
import { DefaultBio, DefaultBioSeedState } from '../models/defaultBio.model';
import sendResponse from '../utils/reponse';
import AppError from '../utils/errorHandler';

const canManageDefaultBios = (req: Request) =>
    ['owner', 'operator', 'superAdmin', 'admin'].includes(String((req as any).user?.role));

const initialBios = [
    'Good vibes, sweet talks, and a little fun - say hello!',
    'Your favorite conversation might be one call away.',
    'Friendly, cheerful, and always ready for an interesting chat.',
    'Let us turn an ordinary moment into a memorable conversation.',
    'Come for the smile, stay for the conversation.',
    'Positive energy, playful chats, and genuine connections.',
    'Tell me your story - I am a great listener with a cheerful vibe.',
    'Looking for a fun conversation? You are in the right place.',
    'A warm hello can start something wonderful.',
    'Let us laugh, talk, and make your day a little brighter.',
];
const ensureInitialBios = async () => {
    await DefaultBio.updateMany({ audience: 'female_host' as any }, { $set: { audience: 'host' } });
    const state = await DefaultBioSeedState.findOneAndUpdate(
        { key: 'host_defaults_v2' },
        { $setOnInsert: { initialized: false } },
        { upsert: true, new: true },
    );
    if (state.initialized) return;
    await DefaultBio.insertMany(initialBios.map((text, sortOrder) => ({
        text, audience: 'host', isActive: true, sortOrder,
    })), { ordered: false }).catch(() => undefined);
    state.initialized = true;
    await state.save();
};
export const getActiveDefaultBios = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await ensureInitialBios();
        const bios = await DefaultBio.find({ audience: 'host', isActive: true })
            .sort({ sortOrder: 1, createdAt: 1 })
            .select('text sortOrder')
            .lean();
        return sendResponse(res, 200, true, 'Default bios fetched successfully', bios);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching default bios', 500));
    }
};

export const getAdminDefaultBios = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!canManageDefaultBios(req)) return sendResponse(res, 403, false, 'Admin access required');
        await ensureInitialBios();
        const bios = await DefaultBio.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
        return sendResponse(res, 200, true, 'Default bios fetched successfully', bios);
    } catch (error: any) {
        next(new AppError(error.message || 'Error fetching default bios', 500));
    }
};

export const createDefaultBio = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!canManageDefaultBios(req)) return sendResponse(res, 403, false, 'Admin access required');
        const currentCount = await DefaultBio.countDocuments({ audience: 'host' });
        if (currentCount >= 10) return sendResponse(res, 400, false, 'Maximum 10 default host bios are allowed. Delete one before adding another.');
        const text = String(req.body.text || '').trim();
        if (!text) return sendResponse(res, 400, false, 'Bio text is required');
        if (text.length > 100) return sendResponse(res, 400, false, 'Bio cannot exceed 100 characters');
        const bio = await DefaultBio.create({
            text,
            audience: 'host',
            isActive: req.body.isActive !== false,
            sortOrder: Number(req.body.sortOrder) || 0,
            createdBy: (req as any).user.id,
        });
        return sendResponse(res, 201, true, 'Default bio added successfully', bio);
    } catch (error: any) {
        if (error?.code === 11000) return sendResponse(res, 409, false, 'This bio already exists');
        next(new AppError(error.message || 'Error adding default bio', 500));
    }
};

export const updateDefaultBio = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!canManageDefaultBios(req)) return sendResponse(res, 403, false, 'Admin access required');
        const update: any = {};
        if (req.body.text !== undefined) {
            const text = String(req.body.text).trim();
            if (!text) return sendResponse(res, 400, false, 'Bio text is required');
            if (text.length > 100) return sendResponse(res, 400, false, 'Bio cannot exceed 100 characters');
            update.text = text;
        }
        if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);
        if (req.body.sortOrder !== undefined) update.sortOrder = Number(req.body.sortOrder) || 0;
        const bio = await DefaultBio.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
        if (!bio) return sendResponse(res, 404, false, 'Default bio not found');
        return sendResponse(res, 200, true, 'Default bio updated successfully', bio);
    } catch (error: any) {
        if (error?.code === 11000) return sendResponse(res, 409, false, 'This bio already exists');
        next(new AppError(error.message || 'Error updating default bio', 500));
    }
};

export const deleteDefaultBio = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!canManageDefaultBios(req)) return sendResponse(res, 403, false, 'Admin access required');
        const bio = await DefaultBio.findByIdAndDelete(req.params.id);
        if (!bio) return sendResponse(res, 404, false, 'Default bio not found');
        return sendResponse(res, 200, true, 'Default bio deleted successfully');
    } catch (error: any) {
        next(new AppError(error.message || 'Error deleting default bio', 500));
    }
};
