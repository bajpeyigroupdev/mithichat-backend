import { Router } from 'express';
import { verifyToken } from '../middlewares/authorize.middleware';
import {
  validateReferralCode,
  getReferralDashboard,
  getReferralHistory,
  getReferralTree,
  getReferralAnalytics,
  getReferralLeaderboard,
  getReferralFunnel,
  getReferralSettings,
  updateReferralSettings,
} from '../controllers/referralController';

const router = Router();

// Public route
router.post('/public/referral/validate', validateReferralCode);

// Authenticated routes
router.get('/referrals/dashboard', verifyToken, getReferralDashboard);
router.get('/referrals/stats', verifyToken, getReferralDashboard);
router.get('/referrals/analytics', verifyToken, getReferralAnalytics);
router.get('/referrals/leaderboard', verifyToken, getReferralLeaderboard);
router.get('/referrals/funnel', verifyToken, getReferralFunnel);
router.get('/referrals/history', verifyToken, getReferralHistory);
router.get('/referrals/tree', verifyToken, getReferralTree);

// Settings (Owner Only)
router.get('/referrals/settings', verifyToken, getReferralSettings);
router.put('/referrals/settings', verifyToken, updateReferralSettings);

export default router;
