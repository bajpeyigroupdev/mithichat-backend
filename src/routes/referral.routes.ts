import express from 'express';
import { verifyToken } from '../middlewares/authorize.middleware';
import { getReferralDetails, claimReferralCode, triggerReconciliation } from '../controllers/referralController';
import { renderReferralLandingPage } from '../controllers/referralLandingController';

const router = express.Router();

// Public Web Referral Landing Page
router.get('/invite', renderReferralLandingPage);
router.get('/v1/invite', renderReferralLandingPage);

router.get('/referral/details', verifyToken, getReferralDetails);
router.get('/v1/referral/details', verifyToken, getReferralDetails);

router.post('/referral/claim', verifyToken, claimReferralCode);
router.post('/v1/referral/claim', verifyToken, claimReferralCode);

// Admin Manual Reconciliation Endpoint
router.post('/admin/referrals/reconcile', verifyToken, triggerReconciliation);
router.post('/v1/admin/referrals/reconcile', verifyToken, triggerReconciliation);

export default router;
