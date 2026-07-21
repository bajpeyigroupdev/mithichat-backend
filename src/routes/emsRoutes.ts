import express from 'express';
import { verifyToken } from '../middlewares/authorize.middleware';
import { checkPermission } from '../middlewares/dynamicPermission.middleware';
import {
  getPermissions,
  updatePermissions,
  getTemplates,
  saveTemplate,
  comparePermissions,
  getWorkflows,
  updateWorkflow,
  createRequest,
  listRequests,
  updateRequestPassword,
  approveRequest,
  rejectRequest,
  getAuditLogs,
  getMyPermissions,
  syncPermissions,
  aiPermissionAssistant,
  aiRiskAnalysis,
  createCustomRole,
  comparePermissionsDetailed,
  restorePermissionVersion
} from '../controllers/emsController';

const router = express.Router();

// Authenticate all incoming requests
router.use(verifyToken);

// ============ Current User Custom Clearance ============
router.get('/my-permissions', getMyPermissions);

// ============ Permission Builder & Templates ============
router.get('/permissions', checkPermission('menus', 'Settings'), getPermissions);
router.post('/permissions', checkPermission('menus', 'Settings'), updatePermissions);
router.get('/templates', checkPermission('menus', 'Settings'), getTemplates);
router.post('/templates', checkPermission('menus', 'Settings'), saveTemplate);
router.get('/compare', checkPermission('menus', 'Settings'), comparePermissions);

// ============ Auto Discovery & AI Permission Assistant 3.0 ============
router.post('/sync-permissions', checkPermission('menus', 'Settings'), syncPermissions);
router.post('/ai-assistant', checkPermission('menus', 'Settings'), aiPermissionAssistant);
router.post('/ai-risk-analysis', checkPermission('menus', 'Settings'), aiRiskAnalysis);

// ============ Enterprise IAM 4.0 Extensions ============
router.post('/roles/custom', checkPermission('menus', 'Settings'), createCustomRole);
router.get('/permissions/compare-detailed', checkPermission('menus', 'Settings'), comparePermissionsDetailed);
router.post('/permissions/version-restore', checkPermission('menus', 'Settings'), restorePermissionVersion);

// ============ Workflows Builder ============
router.get('/workflows', checkPermission('menus', 'Settings'), getWorkflows);
router.post('/workflows', checkPermission('menus', 'Settings'), updateWorkflow);

// ============ Request Center ============
router.post('/requests', createRequest);
router.get('/requests', checkPermission('menus', 'Verification'), listRequests);
router.patch('/requests/:id/password', checkPermission('menus', 'Verification'), updateRequestPassword);
router.post('/requests/:id/approve', checkPermission('menus', 'Verification'), approveRequest);
router.post('/requests/:id/reject', checkPermission('menus', 'Verification'), rejectRequest);

// ============ Audit Logs ============
router.get('/audit-logs', checkPermission('menus', 'Developer'), getAuditLogs);

export default router;
