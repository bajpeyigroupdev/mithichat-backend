import express, { Request, Response } from 'express';
import { getCachedSettings } from '../controllers/settingsController';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';
import { Banner } from '../models/banner.model';
import { createUserFromPublicForm } from '../controllers/formsController';
import { User } from '../models/user.model';
import { generateSecureHash, } from '../utils/passwordHelper';
import { generateUniqueId } from '../utils/generator';

const router = express.Router();

router.get('/settings', async (req: Request, res: Response) => {
    try {
        const settings = await getCachedSettings();
        const publicSettings = {
            privacyPolicy: settings.privacyPolicy,
            termsAndConditions: settings.termsAndConditions,
            coinPrice: settings.coinPrice,
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
        }).select('_id title imageUrl linkUrl priority').sort({ priority: -1, createdAt: -1 }).lean();
        return sendResponse(res, 200, true, 'Active banners fetched successfully', banners);
    } catch (error) {
        await Logger('getPublicBanners', error);
        return sendResponse(res, 500, false, 'Error fetching banners');
    }
});

// ============ Public Application Form ============
// Anyone can submit an application using a referral/employee code link.
// Allowed roles for public apply: host, agency, coinSeller (diamond seller)
const PUBLIC_ALLOWED_ROLES = ['host', 'agency', 'coinSeller'];
const ROLE_CODE_PREFIX: Record<string, string> = {
    host: 'HST',
    agency: 'AGN',
    coinSeller: 'CS',
};

router.post('/apply', async (req: Request, res: Response) => {
    try {
        const { name, email, password, phoneNumber, role, referralCode, documents } = req.body;

        if (!name || !email || !password || !role) {
            return sendResponse(res, 400, false, 'Name, Email, Password, and Role are required.');
        }

        if (!PUBLIC_ALLOWED_ROLES.includes(role)) {
            return sendResponse(res, 400, false, `Invalid role. Allowed: ${PUBLIC_ALLOWED_ROLES.join(', ')}`);
        }

        if (!documents || !Array.isArray(documents) || documents.length === 0) {
            return sendResponse(res, 400, false, 'At least one document URL is required.');
        }

        // Look up senior by referral/employee code
        let seniorId: any = undefined;
        if (referralCode) {
            const senior = await User.findOne({ employeeCode: referralCode, isDeleted: false });
            if (!senior) {
                return sendResponse(res, 404, false, 'Invalid referral code. Please check with your senior.');
            }
            seniorId = senior._id;
        }

        const existing = await User.findOne({ $or: [{ email }, phoneNumber ? { phoneNumber } : {}] });
        if (existing) {
            return sendResponse(res, 400, false, 'User with this Email or Phone already exists.');
        }

        const hashedPassword = await generateSecureHash(password);
        const newUserId = await generateUniqueId();
        const prefix = ROLE_CODE_PREFIX[role] || 'EMP';
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        const employeeCode = `${prefix}${newUserId}${random}`;

        const applicant = await User.create({
            name,
            email,
            password: hashedPassword,
            phoneNumber: phoneNumber || undefined,
            role,
            userId: newUserId,
            gender: 'other',
            emailVerified: false,
            isActive: false, // Pending approval by senior
            employeeCode,
            referredBy: seniorId || undefined,
            documents,
            device: {
                createdDeviceId: 'PUBLIC_FORM',
                currentDeviceId: 'PUBLIC_FORM'
            }
        });

        const applicantData = applicant.toObject();
        delete applicantData.password;

        return sendResponse(res, 201, true, 'Application submitted successfully. Please wait for approval.', {
            ...applicantData,
            employeeCode,
        });
    } catch (error) {
        await Logger('publicApply', error);
        return sendResponse(res, 500, false, 'Error submitting application');
    }
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

