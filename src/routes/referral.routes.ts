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
router.use(verifyToken);

router.get('/referrals/dashboard', getReferralDashboard);
router.get('/referrals/stats', getReferralDashboard);
router.get('/referrals/analytics', getReferralAnalytics);
router.get('/referrals/leaderboard', getReferralLeaderboard);
router.get('/referrals/funnel', getReferralFunnel);
router.get('/referrals/history', getReferralHistory);
router.get('/referrals/tree', getReferralTree);

// Settings (Owner Only)
router.get('/referrals/settings', getReferralSettings);
router.put('/referrals/settings', updateReferralSettings);

export default router;
