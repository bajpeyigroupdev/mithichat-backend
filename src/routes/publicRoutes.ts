import express, { Request, Response } from 'express';
import { getCachedSettings } from '../controllers/settingsController';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';
import { Banner } from '../models/banner.model';
import { createUserFromPublicForm } from '../controllers/formsController';
import { User } from '../models/user.model';
import { generateSecureHash, } from '../utils/passwordHelper';
import { generateUniqueId } from '../utils/generator';
import { submitApplication } from '../controllers/recruitmentController';

const router = express.Router();

router.get('/settings', async (req: Request, res: Response) => {
    try {
        const settings = await getCachedSettings();
        const publicSettings = {
            privacyPolicy: settings.privacyPolicy,
            termsAndConditions: settings.termsAndConditions,
            coinPrice: settings.coinPrice,
            withdrawalPlatformFeePercent: settings.withdrawalPlatformFeePercent,
            callRatePerMinute: settings.callRatePerMinute,
        };
        return sendResponse(res, 200, true, 'Settings fetched successfully', publicSettings);
    } catch (error) {
        await Logger('getPublicSettings', error);
        return sendResponse(res, 500, false, 'Error fetching settings');
    }
});

router.post('/forms/:type', async (req: Request, res: Response) => {
    try {
        const { type } = req.params;
        const payload = req.body || {};
        if (!type) {
            return sendResponse(res, 400, false, 'Form type is required');
        }

        const user = await createUserFromPublicForm(payload, type);
        return sendResponse(res, 201, true, 'Form submitted successfully', {
            userId: user.userId,
            employeeCode: user.employeeCode,
            role: user.role,
            meethiId: user.meethiId,
        });
    } catch (error: any) {
        await Logger('submitPublicForm', error);
        return sendResponse(res, 400, false, error.message || 'Failed to submit form');
    }
});

router.get('/banners', async (_req: Request, res: Response) => {
    try {
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const banners = await Banner.find({
            $and: [
                { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
                { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
                { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: startOfToday } }] }
            ]
        }).select('_id title imageUrl linkUrl targetType targetScreen priority').sort({ priority: -1, createdAt: -1 }).lean();
        return sendResponse(res, 200, true, 'Active banners fetched successfully', banners);
    } catch (error) {
        await Logger('getPublicBanners', error);
        return sendResponse(res, 500, false, 'Error fetching banners');
    }
});

// ============ Public Application Form ============
// Anyone can submit an application using a referral/employee code link.
const PUBLIC_ALLOWED_ROLES = ['host', 'agency', 'admin', 'superAdmin', 'operator', 'coinSeller'];
const ROLE_CODE_PREFIX: Record<string, string> = {
    host: 'HST',
    agency: 'AGN',
    admin: 'ADM',
    superAdmin: 'SA',
    operator: 'OPR',
    coinSeller: 'CS',
};

router.post('/apply', async (req: Request, res: Response) => {
    const roleAliases: Record<string, string> = {
        superAdmin: 'super-admin',
        coinSeller: 'seller',
        customerSupport: 'customer-service',
    };
    req.body = {
        ...req.body,
        phone: req.body?.phone || req.body?.phoneNumber,
        role: roleAliases[req.body?.role] || req.body?.role,
    };
    return submitApplication(req, res);
});

// ============ Team Leader Application Endpoint ============
router.post('/teamleader/apply', async (req: Request, res: Response) => {
    const body = req.body || {};
    req.body = {
        ...body,
        name: body.fullName || body.name,
        email: body.emailAddress || body.email,
        phone: body.mobileNumber || body.phoneNumber || body.phone,
        role: 'operator',
        documents: [
            body.resumeUrl,
            body.portfolioPdfUrl,
            body.experienceLetterUrl,
            body.addressProofUrl,
            body.governmentIdUrl,
            body.profilePhotoUrl,
        ].filter(Boolean),
    };
    return submitApplication(req, res);
});

// ============ Verify Employee Referral Code ============
router.get('/verify-code/:code', async (req: Request, res: Response) => {
    try {
        const { code } = req.params;
        const senior = await User.findOne({ employeeCode: code, isDeleted: false })
            .select('name role employeeCode');
        if (!senior) {
            return sendResponse(res, 404, false, 'Invalid referral code.');
        }
        return sendResponse(res, 200, true, 'Valid referral code', {
            seniorName: senior.name,
            seniorRole: senior.role,
            employeeCode: senior.employeeCode,
        });
    } catch (error) {
        await Logger('verifyReferralCode', error);
        return sendResponse(res, 500, false, 'Error verifying code');
    }
});

export default router;
