import express from 'express';
import {
    verifyReferralCode,
    submitApplication,
    getAdminApplications,
    getApplicationById,
    updateApplicationStatus,
    addReviewNote
} from '../controllers/recruitmentController';
import { verifyToken } from '../middlewares/authorize.middleware';

import {
    getRoleConfigs,
    getRoleConfigByRole,
    upsertRoleConfig
} from '../controllers/recruitmentRoleConfigController';

const router = express.Router();

// Role Config Endpoints
router.get('/configs', getRoleConfigs);
router.get('/config/:role', getRoleConfigByRole);
router.post('/admin/config', verifyToken, upsertRoleConfig);

// Public Recruitment Endpoints
router.get('/verify-referral', verifyReferralCode);
router.get('/verify-referral/:code', verifyReferralCode);

// Dynamic Role Submission Endpoints
router.post('/agency', (req, res) => { (req.params as any).role = 'agency'; submitApplication(req, res); });
router.post('/operator', (req, res) => { (req.params as any).role = 'operator'; submitApplication(req, res); });
router.post('/admin', (req, res) => { (req.params as any).role = 'admin'; submitApplication(req, res); });
router.post('/customer-service', (req, res) => { (req.params as any).role = 'customer-service'; submitApplication(req, res); });
router.post('/super-admin', (req, res) => { (req.params as any).role = 'super-admin'; submitApplication(req, res); });
router.post('/:role', submitApplication);

// Admin Portal Integration Endpoints (Protected by verifyToken middleware if applicable)
router.get('/admin/applications', verifyToken, getAdminApplications);
router.get('/admin/applications/:id', verifyToken, getApplicationById);
router.patch('/admin/applications/:id/status', verifyToken, updateApplicationStatus);
router.post('/admin/applications/:id/notes', verifyToken, addReviewNote);

export default router;
