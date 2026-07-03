import express, { Request, Response } from 'express';
import { getCachedSettings } from '../controllers/settingsController';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

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

export default router;
