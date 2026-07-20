import { Request, Response } from 'express';
import { RecruitmentRoleConfig } from '../models/recruitmentRoleConfig.model';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

export const getRoleConfigs = async (_req: Request, res: Response) => {
    try {
        const configs = await RecruitmentRoleConfig.find({ isActive: true }).lean();
        return sendResponse(res, 200, true, 'Recruitment role configs fetched', configs);
    } catch (error: any) {
        await Logger('getRoleConfigs', error);
        return sendResponse(res, 500, false, 'Failed to fetch recruitment configs');
    }
};

export const getRoleConfigByRole = async (req: Request, res: Response) => {
    try {
        const role = (req.params.role || '').toLowerCase();
        const config = await RecruitmentRoleConfig.findOne({ role, isActive: true }).lean();

        if (!config) {
            return sendResponse(res, 404, false, `No configuration found for role: ${role}`);
        }

        return sendResponse(res, 200, true, 'Role config fetched', config);
    } catch (error: any) {
        await Logger('getRoleConfigByRole', error);
        return sendResponse(res, 500, false, 'Failed to fetch role config');
    }
};

export const upsertRoleConfig = async (req: Request, res: Response) => {
    try {
        const { role, ...configData } = req.body;
        if (!role) {
            return sendResponse(res, 400, false, 'Role key is required');
        }

        const config = await RecruitmentRoleConfig.findOneAndUpdate(
            { role: role.toLowerCase() },
            { role: role.toLowerCase(), ...configData },
            { upsert: true, new: true }
        );

        return sendResponse(res, 200, true, 'Recruitment role config saved', config);
    } catch (error: any) {
        await Logger('upsertRoleConfig', error);
        return sendResponse(res, 500, false, 'Failed to save role config');
    }
};
