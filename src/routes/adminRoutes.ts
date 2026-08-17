import express from 'express';
import { verifyToken } from '../middlewares/authorize.middleware';
import { HierarchyScopeService } from '../utils/hierarchyScope';
import {
    adminLogin,
    adminLogout,
    changePassword,
    getAdminProfile,
    updateAdminProfile,
    addCoinsToUser,
    addDiamondsToUser,
    getAdminRechargeHistory,
    verifyUserForRecharge,
    createAgencyAdmin,
    getAllAdmins,
    toggleBlockAdmin,
    createEmployee,
    listEmployees,
    toggleBlockEmployee,
    overrideEmployeeLinkage,
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
import { listAdmins, getAdmin, toggleAdminBlock, deleteAdmin, resetAdminPassword, getRecruitedMembers } from '../controllers/adminController';
import { listSuperAdmins, getSuperAdmin, toggleSuperAdminBlock, deleteSuperAdmin, resetSuperAdminPassword } from '../controllers/superAdminController';

const router = express.Router();

// ============ Admin Authentication Routes ============
router.post('/login', adminLogin);
router.post('/logout', verifyToken, adminLogout);
router.post('/change-password', verifyToken, changePassword);
router.get('/profile', verifyToken, getAdminProfile);
router.patch('/profile', verifyToken, updateAdminProfile);
router.get('/users/verify/:identifier', verifyToken, verifyUserForRecharge);
router.post('/users/add-coins', verifyToken, addCoinsToUser);
router.post('/users/add-diamonds', verifyToken, addDiamondsToUser);
router.get('/recharges/history', verifyToken, getAdminRechargeHistory);

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
    toggleBannerActive,
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
router.patch('/banners/:id/toggle', verifyToken, toggleBannerActive);

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

// ============ Default Bio App Management ============
import { getAdminDefaultBios, createDefaultBio, updateDefaultBio, deleteDefaultBio } from '../controllers/defaultBioController';
router.get('/default-bios', verifyToken, getAdminDefaultBios);
router.post('/default-bios', verifyToken, createDefaultBio);
router.patch('/default-bios/:id', verifyToken, updateDefaultBio);
router.delete('/default-bios/:id', verifyToken, deleteDefaultBio);

// System Messages Broadcast
import { sendSystemNotification } from '../controllers/notificationController';
router.post('/system-messages', verifyToken, sendSystemNotification as any);

// ============ Event/Offer Broadcast Route ============
import { broadcastEvent, getActivityEvents, createActivityEvent, publishActivityEvent, closeActivityEvent } from '../controllers/managementController';
router.get('/events', verifyToken, getActivityEvents);
router.post('/events', verifyToken, createActivityEvent);
router.post('/events/:id/publish', verifyToken, publishActivityEvent);
router.patch('/events/:id/close', verifyToken, closeActivityEvent);
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
// ============ Recruited Members Module Routes ============
router.get('/recruited-members', verifyToken, getRecruitedMembers);

// ============ Sellers (Coin Sellers) Module Routes ============
router.get('/sellers', verifyToken, async (req: any, res: any) => {
    try {
        const { User } = await import('../models/user.model');
        const { search, page = 1, limit = 20 } = req.query;
        const filter: any = { $and: [
            HierarchyScopeService.buildUserScope({ id: String(req.user.id), role: req.user.role }),
            { role: 'coinSeller', isDeleted: false },
        ] };
        if (search) filter.$and.push({ $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { employeeCode: { $regex: search, $options: 'i' } },
        ] });
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const [sellers, total] = await Promise.all([
            User.find(filter).select('-password -refreshToken').sort({ createdAt: -1 }).skip((pageNum-1)*limitNum).limit(limitNum),
            User.countDocuments(filter)
        ]);
        return res.json({ success: true, message: 'Sellers listed', data: { sellers, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total/limitNum) } } });
    } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// ============ Customer Support Module Routes ============
router.get('/customer-support', verifyToken, async (req: any, res: any) => {
    try {
        const { User } = await import('../models/user.model');
        const { search, page = 1, limit = 20 } = req.query;
        const filter: any = { $and: [
            HierarchyScopeService.buildUserScope({ id: String(req.user.id), role: req.user.role }),
            { role: 'customerSupport', isDeleted: false },
        ] };
        if (search) filter.$and.push({ $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { employeeCode: { $regex: search, $options: 'i' } },
        ] });
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const [staff, total] = await Promise.all([
            User.find(filter).select('-password -refreshToken').sort({ createdAt: -1 }).skip((pageNum-1)*limitNum).limit(limitNum),
            User.countDocuments(filter)
        ]);
        return res.json({ success: true, message: 'Customer Support staff listed', data: { staff, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total/limitNum) } } });
    } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// ============ Agencies Module Routes (EMS-based) ============
router.get('/agencies-list', verifyToken, async (req: any, res: any) => {
    try {
        const { User } = await import('../models/user.model');
        const { search, page = 1, limit = 20 } = req.query;
        const filter: any = { $and: [
            HierarchyScopeService.buildUserScope({ id: String(req.user.id), role: req.user.role }),
            { role: 'agency', isDeleted: false },
        ] };
        if (search) filter.$and.push({ $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { employeeCode: { $regex: search, $options: 'i' } },
        ] });
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const [agencies, total] = await Promise.all([
            User.find(filter).select('-password -refreshToken').sort({ createdAt: -1 }).skip((pageNum-1)*limitNum).limit(limitNum),
            User.countDocuments(filter)
        ]);
        return res.json({ success: true, message: 'Agencies listed', data: { agencies, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total/limitNum) } } });
    } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// ============ Universal User Soft Delete & Restore Endpoints ============
router.post('/users/:id/soft-delete', verifyToken, async (req: any, res: any) => {
    try {
        const { User } = await import('../models/user.model');
        const { id } = req.params;
        const { reason = 'Soft deleted by Administrator' } = req.body;
        const actor = req.user;

        const userObj = await User.findById(id);
        if (!userObj) return res.status(404).json({ success: false, message: 'User not found' });

        userObj.isDeleted = true;
        userObj.status = 'Deleted';
        userObj.deletedAt = new Date();
        userObj.deletedBy = actor?.id || actor?._id;
        userObj.deleteReason = reason;
        await userObj.save();

        return res.json({ success: true, message: `User ${userObj.name || userObj.employeeCode} has been soft-deleted`, data: userObj });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: e.message });
    }
});

router.post('/users/:id/restore', verifyToken, async (req: any, res: any) => {
    try {
        const { User } = await import('../models/user.model');
        const { id } = req.params;

        const userObj = await User.findById(id);
        if (!userObj) return res.status(404).json({ success: false, message: 'User not found' });

        userObj.isDeleted = false;
        userObj.status = 'Active';
        userObj.deletedAt = undefined;
        userObj.deletedBy = undefined;
        userObj.deleteReason = '';
        await userObj.save();

        return res.json({ success: true, message: `User ${userObj.name || userObj.employeeCode} restored successfully`, data: userObj });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: e.message });
    }
});

// ============ Transfer Management Endpoints ============
router.post('/users/:id/transfer', verifyToken, async (req: any, res: any) => {
    try {
        const { User } = await import('../models/user.model');
        const { TransferHistory } = await import('../models/transferHistory.model');
        const { id } = req.params;
        const { newParentId, newParentRole, reason = 'Transfer approved by Admin' } = req.body;
        const actor = req.user;

        const userObj = await User.findById(id);
        if (!userObj) return res.status(404).json({ success: false, message: 'Target user not found' });

        const oldParentId = userObj.parentId;
        const oldParentRole = userObj.parentRole || '';

        // Update user parentage
        userObj.parentId = newParentId;
        userObj.parentRole = newParentRole;
        if (newParentRole === 'agency') userObj.agencyId = newParentId;
        if (newParentRole === 'operator') userObj.operatorId = newParentId;
        if (newParentRole === 'superAdmin') userObj.superAdminId = newParentId;
        await userObj.save();

        // Record Transfer History
        const transferRecord = await TransferHistory.create({
            targetUserId: userObj._id,
            transferType: 'Role_Transfer',
            oldParentId,
            oldParentRole,
            newParentId,
            newParentRole,
            transferredBy: actor?.id || actor?._id,
            transferDate: new Date(),
            reason,
            status: 'Approved'
        });

        return res.json({
            success: true,
            message: `User ${userObj.name || userObj.employeeCode} transferred successfully.`,
            data: { user: userObj, transferRecord }
        });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: e.message });
    }
});

router.get('/users/:id/transfer-history', verifyToken, async (req: any, res: any) => {
    try {
        const { TransferHistory } = await import('../models/transferHistory.model');
        const { id } = req.params;
        const history = await TransferHistory.find({ targetUserId: id })
            .populate('oldParentId', 'name email role employeeCode')
            .populate('newParentId', 'name email role employeeCode')
            .populate('transferredBy', 'name email role employeeCode')
            .sort({ createdAt: -1 });

        return res.json({ success: true, message: 'Transfer history retrieved', data: history });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: e.message });
    }
});

// Security & Logs Management Routes
router.get('/security/system-logs', verifyToken, getSystemLogs);
router.get('/security/audit-logs', verifyToken, getAuditLogs);
router.get('/logs', verifyToken, getSystemLogs);

// Reports Management Routes
router.get('/reports', verifyToken, getAllReports);
router.get('/reports/:id', verifyToken, getReportById);
router.post('/reports/:id/resolve', verifyToken, resolveReport);
router.post('/reports/:id/dismiss', verifyToken, dismissReport);
router.patch('/reports/:id/resolve', verifyToken, resolveReport);
router.patch('/reports/:id/dismiss', verifyToken, dismissReport);

// Help & Support Tickets Routes
router.get('/help', verifyToken, getHelpTickets);
router.get('/help-tickets', verifyToken, getHelpTickets);
router.post('/help/resolve', verifyToken, replyHelpTicket);
router.post('/help/:id/reply', verifyToken, replyHelpTicket);
router.patch('/help/:id/reply', verifyToken, replyHelpTicket);

export default router;


