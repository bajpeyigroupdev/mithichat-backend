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
  getRequestById,
  updateRequestStatus,
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
  restorePermissionVersion,
  registerPage,
  listRegisteredPages,
  clonePermissions,
  duplicateRole,
  exportPermissions,
  importPermissions
} from '../controllers/emsController';

const router = express.Router();

// Authenticate all incoming requests
router.use(verifyToken);

// ============ Current User Custom Clearance ============
router.get('/my-permissions', getMyPermissions);

// ============ Permission Builder & Templates ============
router.get('/permissions', getPermissions);
router.post('/permissions', updatePermissions);
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
router.get('/requests', listRequests);
router.get('/requests/:id', getRequestById);
router.patch('/requests/:id/status', updateRequestStatus);
router.patch('/requests/:id/password', updateRequestPassword);
router.post('/requests/:id/approve', approveRequest);
router.post('/requests/:id/reject', rejectRequest);

// ============ Audit Logs ============
router.get('/audit-logs', checkPermission('menus', 'Settings'), getAuditLogs);

// ============ Dynamic Page Registry & Enterprise IAM 4.0 Extensions ============
router.post('/pages/register', registerPage);
router.get('/pages', listRegisteredPages);
router.post('/permissions/clone', checkPermission('menus', 'Settings'), clonePermissions);
router.post('/roles/duplicate', checkPermission('menus', 'Settings'), duplicateRole);
router.get('/permissions/export', checkPermission('menus', 'Settings'), exportPermissions);
router.post('/permissions/import', checkPermission('menus', 'Settings'), importPermissions);

export default router;
