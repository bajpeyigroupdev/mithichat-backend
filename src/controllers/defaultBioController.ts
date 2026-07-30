import { Request, Response } from 'express';
import { DefaultBio } from '../models/defaultBio.model';
import sendResponse from '../utils/reponse';
import { AuthRequest } from '../middlewares/authorize.middleware';

// 1. Get All Default Bios (App Users & Admin)
export const getDefaultBios = async (req: Request, res: Response) => {
  try {
    const { activeOnly } = req.query;
    const filter: any = {};

    if (activeOnly === 'true' || activeOnly === undefined) {
      filter.isActive = true;
    }

    const bios = await DefaultBio.find(filter).sort({ sortOrder: 1, createdAt: -1 });
    return sendResponse(res, 200, true, 'Default bios fetched successfully', bios);
  } catch (error: any) {
    return sendResponse(res, 500, false, error?.message || 'Server error fetching default bios');
  }
};

export const getActiveDefaultBios = getDefaultBios;
export const getAdminDefaultBios = getDefaultBios;

// 2. Create Default Bio (Admin)
export const createDefaultBio = async (req: AuthRequest, res: Response) => {
  try {
    const { text, isActive, sortOrder } = req.body;

    if (!text || !text.trim()) {
      return sendResponse(res, 400, false, 'Default bio text is required');
    }

    const existing = await DefaultBio.findOne({ text: text.trim() });
    if (existing) {
      return sendResponse(res, 400, false, 'A default bio with this text already exists');
    }

    const bio = new DefaultBio({
      text: text.trim(),
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: Number(sortOrder) || 0,
      createdBy: req.user?.id,
    });

    await bio.save();
    return sendResponse(res, 201, true, 'Default bio created successfully', bio);
  } catch (error: any) {
    return sendResponse(res, 500, false, error?.message || 'Server error creating default bio');
  }
};

// 3. Update Default Bio (Admin)
export const updateDefaultBio = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { text, isActive, sortOrder } = req.body;

    const bio = await DefaultBio.findById(id);
    if (!bio) {
      return sendResponse(res, 404, false, 'Default bio not found');
    }

    if (text) bio.text = text.trim();
    if (isActive !== undefined) bio.isActive = Boolean(isActive);
    if (sortOrder !== undefined) bio.sortOrder = Number(sortOrder);

    await bio.save();
    return sendResponse(res, 200, true, 'Default bio updated successfully', bio);
  } catch (error: any) {
    return sendResponse(res, 500, false, error?.message || 'Server error updating default bio');
  }
};

// 4. Delete Default Bio (Admin)
export const deleteDefaultBio = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const bio = await DefaultBio.findByIdAndDelete(id);

    if (!bio) {
      return sendResponse(res, 404, false, 'Default bio not found');
    }

    return sendResponse(res, 200, true, 'Default bio deleted successfully');
  } catch (error: any) {
    return sendResponse(res, 500, false, error?.message || 'Server error deleting default bio');
  }
};
