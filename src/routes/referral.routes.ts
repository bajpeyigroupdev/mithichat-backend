import express from 'express';
import { verifyToken } from '../middlewares/authorize.middleware';
import { getReferralDetails, claimReferralCode } from '../controllers/referralController';

const router = express.Router();

router.get('/referral/details', verifyToken, getReferralDetails);
router.get('/v1/referral/details', verifyToken, getReferralDetails);

router.post('/referral/claim', verifyToken, claimReferralCode);
router.post('/v1/referral/claim', verifyToken, claimReferralCode);

export default router;
