import express from 'express';
import { verifyToken } from '../middlewares/authorize.middleware';
import {
    adminLogin,
    adminLogout,
    getAdminProfile,
    updateAdminProfile,
    addCoinsToUser,
    addDiamondsToUser,
} from '../controllers/adminAuthController';
import {
    getDashboardStats,
    getRevenueChart,
    getEarningsChart,
    getCallTrends,
    getCoinDistribution,
} from '../controllers/dashboardController';
import {
    getAllReports,
    getReportById,
    resolveReport,
    dismissReport,
} from '../controllers/reportsController';
import { listAdmins, getAdmin, toggleAdminBlock, deleteAdmin, resetAdminPassword } from '../controllers/adminController';
import { listSuperAdmins, getSuperAdmin, toggleSuperAdminBlock, deleteSuperAdmin, resetSuperAdminPassword } from '../controllers/superAdminController';

const router = express.Router();

// ============ Admin Authentication Routes ============
router.post('/login', adminLogin);
router.post('/logout', verifyToken, adminLogout);
router.get('/profile', verifyToken, getAdminProfile);
router.patch('/profile', verifyToken, updateAdminProfile);
router.post('/users/add-coins', verifyToken, addCoinsToUser);
router.post('/users/add-diamonds', verifyToken, addDiamondsToUser);

// Self-promote to owner (superAdmin only, one-time setup)
router.post('/promote-owner', verifyToken, async (req: any, res: any) => {
    try {
        const { User } = await import('../models/user.model');
        const user = await User.findById(req.user?.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (!['superAdmin', 'owner'].includes(String(user.role))) {
            return res.status(403).json({ success: false, message: 'Only superAdmin can self-promote to owner' });
        }
        user.role = 'owner' as any;
        await user.save();
        return res.json({ success: true, message: 'Role updated to owner. Please re-login.' });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: e.message });
    }
});



import { createAgencyAdmin, getAllAdmins, toggleBlockAdmin, createEmployee, listEmployees, toggleBlockEmployee, overrideEmployeeLinkage } from '../controllers/adminAuthController';
// Role Hierarchy: Create/List/Block employees
router.post('/employees/create', verifyToken, createEmployee);
router.get('/employees/list', verifyToken, listEmployees);
router.patch('/employees/block/:id', verifyToken, toggleBlockEmployee);
router.patch('/employees/override/:id', verifyToken, overrideEmployeeLinkage);
// Legacy routes (kept for backward compat)
router.post('/create-admin', verifyToken, createAgencyAdmin);
router.get('/list-admins', verifyToken, getAllAdmins);
router.patch('/block-admin/:id', verifyToken, toggleBlockAdmin);


// ============ Dashboard Analytics Routes ============
router.get('/dashboard/stats', verifyToken, getDashboardStats);
router.get('/dashboard/revenue-chart', verifyToken, getRevenueChart);
router.get('/dashboard/earnings-chart', verifyToken, getEarningsChart);
router.get('/dashboard/call-trends', verifyToken, getCallTrends);
router.get('/dashboard/coin-distribution', verifyToken, getCoinDistribution);

// ============ Reports/Moderation Routes ============
router.get('/reports', verifyToken, getAllReports);
router.get('/reports/:id', verifyToken, getReportById);
router.post('/reports/:id/resolve', verifyToken, resolveReport);
router.post('/reports/:id/dismiss', verifyToken, dismissReport);

// ============ Host Management Routes ============
import {
    getHosts,
    getAppliedHosts,
    approveHost,
    blockHost
} from '../controllers/hostController';
import { getAdminHostUsers } from '../controllers/userController';

router.get('/hosts/users', verifyToken, getAdminHostUsers);  // All users with role: host
router.get('/hosts/list', verifyToken, getHosts);
router.get('/hosts/applications', verifyToken, getAppliedHosts);
router.post('/hosts/approve/:id', verifyToken, approveHost);
router.patch('/hosts/block/:id', verifyToken, blockHost);


// ============ Call Management Routes ============
import { getAllCallHistory } from '../controllers/callController';
router.get('/calls/history', verifyToken, getAllCallHistory);

// ============ System Settings Routes ============
import { getSettings, updateSettings } from '../controllers/settingsController';
router.get('/settings', verifyToken, getSettings);
router.patch('/settings', verifyToken, updateSettings);

// ============ Withdrawal Management Routes ============
import { getPendingWithdrawals, processWithdrawal } from '../controllers/withdrawalController';
router.get('/withdrawals/pending', verifyToken, getPendingWithdrawals);
router.post('/withdrawals/process', verifyToken, processWithdrawal);

// ============ Enterprise Management Panel Routes ============
import {
    getAllRooms,
    createRoom,
    toggleLockRoom,
    deleteRoom,
    kickUserFromRoom,
    muteUserInRoom,
    getAllBanners,
    createBanner,
    deleteBanner,
    updateBannerPriority,
    getAllAds,
    createAd,
    deleteAd,
    updateAd,
    getReferralStats,
    getPromoCodes,
    createPromoCode,
    deletePromoCode,
    getVipPlans,
    createVipPlan,
    deleteVipPlan,
    getVipSubscribers,
    getAllAgencies,
    createAgency,
    blockAgency,
    assignHostToAgency,
    getBlockedWords,
    addBlockedWord,
    deleteBlockedWord,
    getAuditLogs,
    getSystemLogs,
    getHelpTickets,
    replyHelpTicket,
    getDeletionRequests,
    processDeletionRequest
} from '../controllers/managementController';

// Rooms Management
router.get('/rooms', verifyToken, getAllRooms);
router.post('/rooms', verifyToken, createRoom);
router.delete('/rooms/:id', verifyToken, deleteRoom);
router.patch('/rooms/:id/lock', verifyToken, toggleLockRoom);
router.post('/rooms/:id/kick', verifyToken, kickUserFromRoom);
router.post('/rooms/:id/mute', verifyToken, muteUserInRoom);

// Banners Management
router.get('/banners', verifyToken, getAllBanners);
router.post('/banners', verifyToken, createBanner);
router.delete('/banners/:id', verifyToken, deleteBanner);
router.patch('/banners/:id', verifyToken, updateBannerPriority);

// Ads Management
router.get('/ads', verifyToken, getAllAds);
router.post('/ads', verifyToken, createAd);
router.delete('/ads/:id', verifyToken, deleteAd);
router.patch('/ads/:id', verifyToken, updateAd);

// Referrals & Promo Codes
router.get('/referrals/stats', verifyToken, getReferralStats);
router.get('/referrals/promo-codes', verifyToken, getPromoCodes);
router.post('/referrals/promo-code', verifyToken, createPromoCode);
router.delete('/referrals/promo-code/:id', verifyToken, deletePromoCode);

// VIP Management
router.get('/vip/plans', verifyToken, getVipPlans);
router.post('/vip/plans', verifyToken, createVipPlan);
router.delete('/vip/plans/:id', verifyToken, deleteVipPlan);
router.get('/vip/subscribers', verifyToken, getVipSubscribers);

// Agency Management
router.get('/agencies', verifyToken, getAllAgencies);
router.post('/agencies', verifyToken, createAgency);
router.patch('/agencies/:id', verifyToken, blockAgency);
router.post('/agencies/assign-host', verifyToken, assignHostToAgency);

// Content Moderation
router.get('/moderation/blocked-words', verifyToken, getBlockedWords);
router.post('/moderation/blocked-words', verifyToken, addBlockedWord);
router.delete('/moderation/blocked-words/:id', verifyToken, deleteBlockedWord);

// Security & Logs
router.get('/security/audit-logs', verifyToken, getAuditLogs);
router.get('/security/system-logs', verifyToken, getSystemLogs);

// Help Desk Support
router.get('/help', verifyToken, getHelpTickets);
router.patch('/help/:id/reply', verifyToken, replyHelpTicket);

// User Deletion Approval Management
router.get('/deletion-requests', verifyToken, getDeletionRequests);
router.post('/deletion-requests/:id/process', verifyToken, processDeletionRequest);

import { getLevels, createLevel, updateLevel, deleteLevel } from '../controllers/levelController';
router.get('/levels', verifyToken, getLevels);
router.post('/levels', verifyToken, createLevel);
router.patch('/levels/:id', verifyToken, updateLevel);
router.delete('/levels/:id', verifyToken, deleteLevel);

// Alias routes under /host-levels for admin Host Level Config page
router.get('/host-levels', verifyToken, getLevels);
router.post('/host-levels', verifyToken, createLevel);
router.patch('/host-levels/:id', verifyToken, updateLevel);
router.delete('/host-levels/:id', verifyToken, deleteLevel);

// ============ Event/Offer Broadcast Route ============
import { broadcastEvent } from '../controllers/managementController';
router.post('/events/broadcast', verifyToken, broadcastEvent);

import { listOperators, getOperator, toggleOperatorBlock, deleteOperator, resetOperatorPassword } from '../controllers/operatorController';

// ============ Operator Module Routes ============
router.get('/operators', verifyToken, listOperators);
router.get('/operators/:id', verifyToken, getOperator);
router.patch('/operators/:id/toggle-block', verifyToken, toggleOperatorBlock);
router.delete('/operators/:id', verifyToken, deleteOperator);
router.post('/operators/:id/reset-password', verifyToken, resetOperatorPassword);

// ============ Admin Module Routes ============
router.get('/admins', verifyToken, listAdmins);
router.get('/admins/:id', verifyToken, getAdmin);
router.patch('/admins/:id/toggle-block', verifyToken, toggleAdminBlock);
router.delete('/admins/:id', verifyToken, deleteAdmin);
router.post('/admins/:id/reset-password', verifyToken, resetAdminPassword);

// ============ Super Admin Module Routes ============
router.get('/super-admins', verifyToken, listSuperAdmins);
router.get('/super-admins/:id', verifyToken, getSuperAdmin);
router.patch('/super-admins/:id/toggle-block', verifyToken, toggleSuperAdminBlock);
router.delete('/super-admins/:id', verifyToken, deleteSuperAdmin);
router.post('/super-admins/:id/reset-password', verifyToken, resetSuperAdminPassword);

export default router;

