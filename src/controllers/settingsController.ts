import { Request, Response, NextFunction } from 'express';
import { Settings } from '../models/settings.model';
import sendResponse from '../utils/reponse';
import AppError from '../utils/errorHandler';
import { Logger } from '../utils/logger';
import { cacheService } from '../utils/cache';
import { config } from '../configs/envConfig';
import { decryptSensitive, encryptSensitive } from '../utils/verificationSecurity';

const APP_MANAGER_ROLES = new Set(['owner', 'operator', 'superAdmin', 'admin']);
const canManage = (req: Request) => APP_MANAGER_ROLES.has(String((req as any).user?.role));

const NUMBER_RULES: Record<string, { min: number; max: number }> = {
    commissionRate: { min: 0, max: 100 },
    giftCommissionPercent: { min: 0, max: 100 },
    withdrawalPlatformFeePercent: { min: 0, max: 100 },
    coinPrice: { min: 0, max: 1000000 },
    minPayout: { min: 0, max: 100000000 },
    callRatePerMinute: { min: 1, max: 1000000 },
    hostSharePerMinute: { min: 0, max: 1000000 },
    chatMessageCost: { min: 0, max: 1000000 },
    chatMessageLimit: { min: 1, max: 5000 },
    welcomeRewardDiamonds: { min: 0, max: 100000 },
    referralRewardDiamonds: { min: 0, max: 100000 },
    defaultMaxAccountsPerDevice: { min: 1, max: 1000 },
};
const BOOLEAN_KEYS = ['maintenanceMode', 'emailAlerts', 'userNotifications', 'systemDigest'];
const CONTENT_KEYS = ['privacyPolicy', 'termsAndConditions'];

export const getCachedSettings = async () => {
    return cacheService.getOrSet('global_settings', async () => {
        let settings = await Settings.findOne();
        if (!settings) settings = await Settings.create({});
        return settings;
    });
};

export const getAgoraCredentials = async () => {
    const settings = await Settings.findOne().select('+agoraCertificateEncrypted').lean();
    let certificate = config.AGORA_APP_CERTIFICATE || '';
    if (settings?.agoraCertificateEncrypted) {
        try {
            certificate = decryptSensitive(settings.agoraCertificateEncrypted);
        } catch (error) {
            console.error('Unable to decrypt configured Agora certificate:', error);
        }
    }
    return {
        appId: settings?.agoraAppId || config.AGORA_APP_ID || '',
        certificate,
    };
};

const safeSettings = (settings: any) => {
    const value = settings?.toObject ? settings.toObject() : { ...(settings || {}) };
    const certificateConfigured = Boolean(value.agoraCertificateEncrypted || config.AGORA_APP_CERTIFICATE);
    delete value.agoraCertificateEncrypted;
    return {
        ...value,
        agoraAppId: value.agoraAppId || config.AGORA_APP_ID || '',
        agoraCertificateConfigured: Boolean(value.agoraAppId || config.AGORA_APP_ID) && certificateConfigured,
    };
};
export const getSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!canManage(req)) return sendResponse(res, 403, false, 'App Management access required');
        const settings = await Settings.findOne().select('+agoraCertificateEncrypted') || await Settings.create({});
        return sendResponse(res, 200, true, 'Settings fetched successfully', safeSettings(settings));
    } catch (error) {
        await Logger('getSettings', error);
        next(new AppError('Error fetching settings', 500));
    }
};

export const updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!canManage(req)) return sendResponse(res, 403, false, 'App Management access required');
        const updates: Record<string, any> = {};

        for (const [key, rule] of Object.entries(NUMBER_RULES)) {
            if (req.body[key] === undefined) continue;
            const value = Number(req.body[key]);
            if (!Number.isFinite(value) || value < rule.min || value > rule.max) {
                return sendResponse(res, 400, false, `Invalid value for ${key}`);
            }
            updates[key] = value;
        }
        for (const key of BOOLEAN_KEYS) {
            if (req.body[key] !== undefined) updates[key] = Boolean(req.body[key]);
        }
        for (const key of CONTENT_KEYS) {
            if (req.body[key] !== undefined) updates[key] = String(req.body[key]);
        }
        if (req.body.agoraAppId !== undefined) {
            const appId = String(req.body.agoraAppId).trim();
            if (appId && !/^[a-f0-9]{32}$/i.test(appId)) {
                return sendResponse(res, 400, false, 'Agora App ID must be 32 hexadecimal characters');
            }
            updates.agoraAppId = appId;
        }
        if (req.body.agoraAppCertificate) {
            const certificate = String(req.body.agoraAppCertificate).trim();
            if (!/^[a-f0-9]{32}$/i.test(certificate)) {
                return sendResponse(res, 400, false, 'Agora certificate must be 32 hexadecimal characters');
            }
            updates.agoraCertificateEncrypted = encryptSensitive(certificate);
        }

        const settings = await Settings.findOneAndUpdate({}, { $set: updates }, {
            new: true, upsert: true, runValidators: true,
        }).select('+agoraCertificateEncrypted');
        cacheService.del('global_settings');
        return sendResponse(res, 200, true, 'App settings updated successfully', safeSettings(settings));
    } catch (error: any) {
        await Logger('updateSettings', error);
        next(new AppError(error.message || 'Error updating settings', 500));
    }
};
