import express from 'express';
import { verifyToken } from '../middlewares/authorize.middleware';
import {
    adminLogin,
    adminLogout,
    getAdminProfile,
    updateAdminProfile,
    addCoinsToUser,
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

const router = express.Router();

// ============ Admin Authentication Routes ============
router.post('/login', adminLogin);
router.post('/logout', verifyToken, adminLogout);
router.get('/profile', verifyToken, getAdminProfile);
router.patch('/profile', verifyToken, updateAdminProfile);
router.post('/users/add-coins', verifyToken, addCoinsToUser);

import { createAgencyAdmin, getAllAdmins, toggleBlockAdmin } from '../controllers/adminAuthController';
// SuperAdmin Only: Manage Agency Admins
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

export default router;
