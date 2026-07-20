import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/authorize.middleware';
import { Permission } from '../models/permission.model';
import { Workflow } from '../models/workflow.model';
import { Request as RequestModel, RequestStatus, IRequest } from '../models/request.model';
import { User } from '../models/user.model';
import { AuditLog } from '../models/auditLog.model';
import { Counter } from '../models/counter.model';
import sendResponse from '../utils/reponse';
import { generateSecureHash } from '../utils/passwordHelper';
import { generateUniqueId } from '../utils/generator';

// ============ Helper: Log activity ============
export const logActivity = async (
  actorId: string,
  actorRole: string,
  action: string,
  target: string,
  details: string,
  ipAddress: string = '127.0.0.1'
) => {
  try {
    await AuditLog.create({
      adminId: actorId,
      action,
      target,
      ipAddress,
      details,
    });
  } catch (error) {
    console.error('[Audit Log Error]:', error);
  }
};

// ============ Special Code Suffix Counter Generator ============
const getNextSequenceValue = async (sequenceName: string): Promise<number> => {
  const sequenceDocument = await Counter.findOneAndUpdate(
    { modelName: sequenceName },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return sequenceDocument.seq;
};

// Role prefixes for special codes
const roleCodePrefix: Record<string, string> = {
  owner: 'OWN',
  operator: 'OPR',
  superAdmin: 'SUP',
  admin: 'ADM',
  agency: 'AGY',
  coinSeller: 'SEL',
  host: 'HST',
  customerSupport: 'SUPT',
  user: 'USR',
};

export const generateSpecialCode = async (role: string, name: string): Promise<string> => {
  const cleanName = name.trim().replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase() || 'XX';
  const prefix = roleCodePrefix[role] || 'USR';
  const seq = await getNextSequenceValue(prefix);
  return `${prefix}-${cleanName}-${seq}`;
};

// Strong random password generator
export const generateStrongPassword = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const defaultRolePermissions: Record<string, {
  menus: string[];
  pages: string[];
  modules: string[];
  actions: string[];
  dashboardWidgets: string[];
  buttons: string[];
  columns: Record<string, string[]>;
}> = {
  owner: {
    menus: ['Dashboard', 'Users', 'Host', 'Agency', 'Coin Seller', 'Reports', 'Notifications', 'Finance', 'Settings', 'Developer', 'Admin', 'SuperAdmin'],
    pages: [],
    modules: [],
    actions: [],
    dashboardWidgets: ["Today's Minutes", "Coins Spent Today", "Host Earnings Today", "Today's Revenue", "Total Users", "Total Hosts", "Active Hosts", "Reports Pending"],
    buttons: ['Add', 'Edit', 'Delete', 'Suspend', 'Activate', 'Recharge', 'Export'],
    columns: { user: ['UID', 'Name', 'Email', 'Role', 'Status', 'Joined'] }
  },
  operator: {
    menus: ['Dashboard', 'Users', 'Host', 'Agency', 'Coin Seller', 'Reports', 'Notifications', 'Finance', 'Settings', 'Developer', 'Admin', 'SuperAdmin'],
    pages: [],
    modules: [],
    actions: [],
    dashboardWidgets: ["Today's Minutes", "Coins Spent Today", "Host Earnings Today", "Today's Revenue", "Total Users", "Total Hosts", "Active Hosts", "Reports Pending"],
    buttons: ['Add', 'Edit', 'Delete', 'Suspend', 'Activate', 'Recharge', 'Export'],
    columns: { user: ['UID', 'Name', 'Email', 'Role', 'Status', 'Joined'] }
  },
  superAdmin: {
    menus: ['Dashboard', 'Users', 'Host', 'Agency', 'Coin Seller', 'Reports', 'Notifications', 'Finance', 'Settings', 'Admin', 'SuperAdmin'],
    pages: [],
    modules: [],
    actions: [],
    dashboardWidgets: ["Today's Minutes", "Coins Spent Today", "Host Earnings Today", "Today's Revenue", "Total Users", "Total Hosts", "Active Hosts", "Reports Pending"],
    buttons: ['Add', 'Edit', 'Delete', 'Suspend', 'Activate', 'Recharge', 'Export'],
    columns: { user: ['UID', 'Name', 'Email', 'Role', 'Status', 'Joined'] }
  },
  admin: {
    menus: ['Dashboard', 'Users', 'Host', 'Agency', 'Coin Seller', 'Reports', 'Notifications', 'Finance', 'Admin'],
    pages: [],
    modules: [],
    actions: [],
    dashboardWidgets: ["Today's Minutes", "Coins Spent Today", "Host Earnings Today", "Total Users", "Total Hosts", "Active Hosts"],
    buttons: ['Add', 'Edit', 'Suspend', 'Activate', 'Recharge', 'Export'],
    columns: { user: ['UID', 'Name', 'Email', 'Role', 'Status', 'Joined'] }
  },
  agency: {
    menus: ['Dashboard', 'Users', 'Host'],
    pages: [],
    modules: [],
    actions: [],
    dashboardWidgets: ["Total Hosts", "Active Hosts"],
    buttons: ['Add', 'Edit', 'Export'],
    columns: { user: ['UID', 'Name', 'Role', 'Status', 'Joined'] }
  },
  host: {
    menus: ['Dashboard', 'Host'],
    pages: [],
    modules: [],
    actions: [],
    dashboardWidgets: ["Today's Minutes", "Host Earnings Today"],
    buttons: [],
    columns: { user: ['UID', 'Name', 'Role', 'Status'] }
  },
  coinSeller: {
    menus: ['Dashboard', 'Finance'],
    pages: [],
    modules: [],
    actions: [],
    dashboardWidgets: ["Coins Spent Today"],
    buttons: ['Recharge'],
    columns: { user: ['UID', 'Name', 'Role', 'Status'] }
  },
  customerSupport: {
    menus: ['Dashboard', 'Reports', 'Notifications'],
    pages: [],
    modules: [],
    actions: [],
    dashboardWidgets: ["Reports Pending"],
    buttons: ['Suspend', 'Activate'],
    columns: { user: ['UID', 'Name', 'Role', 'Status', 'Joined'] }
  }
};

export const getPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { targetType, targetId } = req.query;

    if (!targetType || !targetId) {
      return sendResponse(res, 400, false, 'targetType and targetId are required queries.');
    }

    let permission = await Permission.findOne({ targetType, targetId });
    if (!permission) {
      // Find fallback if it is a role default configuration
      const fallback = (targetType === 'role' && defaultRolePermissions[targetId as string]) || {
        menus: [],
        pages: [],
        modules: [],
        actions: [],
        fields: {},
        buttons: [],
        columns: {},
        dashboardWidgets: [],
      };

      permission = await Permission.create({
        targetType,
        targetId,
        menus: fallback.menus,
        pages: fallback.pages,
        modules: fallback.modules,
        actions: fallback.actions,
        fields: {},
        buttons: fallback.buttons,
        columns: fallback.columns,
        dashboardWidgets: fallback.dashboardWidgets,
      });
    }

    return sendResponse(res, 200, true, 'Permissions retrieved successfully', permission);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

export const getMyPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return sendResponse(res, 401, false, 'Unauthorized - No user attached');
    }

    // Check user-level override first
    let permission = await Permission.findOne({ targetType: 'user', targetId: user.id.toString() });
    if (!permission) {
      // Check role default
      permission = await Permission.findOne({ targetType: 'role', targetId: user.role });
    }

    if (!permission) {
      // Return default permissions matching user role immediately
      const fallback = defaultRolePermissions[user.role] || defaultRolePermissions.host;
      return sendResponse(res, 200, true, 'Default role permissions fallback', {
        menus: fallback.menus,
        pages: fallback.pages,
        modules: fallback.modules,
        actions: fallback.actions,
        fields: {},
        buttons: fallback.buttons,
        columns: fallback.columns,
        dashboardWidgets: fallback.dashboardWidgets,
      });
    }

    return sendResponse(res, 200, true, 'Permissions retrieved successfully', permission);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

export const updatePermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { targetType, targetId, permissions } = req.body;
    const actor = req.user!;

    if (!targetType || !targetId || !permissions) {
      return sendResponse(res, 400, false, 'targetType, targetId, and permissions data are required.');
    }

    const updatedPermission = await Permission.findOneAndUpdate(
      { targetType, targetId },
      { ...permissions },
      { new: true, upsert: true }
    );

    // Audit Log
    await logActivity(
      actor.id.toString(),
      actor.role,
      'Permission Changed',
      `${targetType}:${targetId}`,
      `Permissions updated by ${actor.name} for ${targetType} ID: ${targetId}`
    );

    return sendResponse(res, 200, true, 'Permissions updated successfully', updatedPermission);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

export const getTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const templates = await Permission.find({ isTemplate: true });
    return sendResponse(res, 200, true, 'Templates retrieved successfully', templates);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

export const saveTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { templateName, permissions } = req.body;
    const actor = req.user!;

    if (!templateName) {
      return sendResponse(res, 400, false, 'Template name is required.');
    }

    const template = await Permission.findOneAndUpdate(
      { isTemplate: true, templateName },
      { ...permissions, targetType: 'role', targetId: 'template', isTemplate: true, templateName },
      { new: true, upsert: true }
    );

    await logActivity(
      actor.id.toString(),
      actor.role,
      'Template Created',
      templateName,
      `Saved permission template: ${templateName}`
    );

    return sendResponse(res, 200, true, 'Permission template saved successfully', template);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

export const comparePermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { user1Id, user2Id } = req.query;

    if (!user1Id || !user2Id) {
      return sendResponse(res, 400, false, 'Two user IDs are required for comparison.');
    }

    const user1 = await User.findById(user1Id);
    const user2 = await User.findById(user2Id);

    if (!user1 || !user2) {
      return sendResponse(res, 404, false, 'One or both users not found.');
    }

    // Retrieve user permissions or fall back to their roles
    let p1 = await Permission.findOne({ targetType: 'user', targetId: (user1 as any)._id.toString() });
    if (!p1) p1 = await Permission.findOne({ targetType: 'role', targetId: user1.role });

    let p2 = await Permission.findOne({ targetType: 'user', targetId: (user2 as any)._id.toString() });
    if (!p2) p2 = await Permission.findOne({ targetType: 'role', targetId: user2.role });

    const getDiff = (arr1: string[] = [], arr2: string[] = []) => {
      const added = arr1.filter((x) => !arr2.includes(x));
      const removed = arr2.filter((x) => !arr1.includes(x));
      return { added, removed };
    };

    const diff = {
      user1: { name: user1.name, email: user1.email, role: user1.role },
      user2: { name: user2.name, email: user2.email, role: user2.role },
      menus: getDiff(p1?.menus, p2?.menus),
      pages: getDiff(p1?.pages, p2?.pages),
      modules: getDiff(p1?.modules, p2?.modules),
      actions: getDiff(p1?.actions, p2?.actions),
      buttons: getDiff(p1?.buttons, p2?.buttons),
      dashboardWidgets: getDiff(p1?.dashboardWidgets, p2?.dashboardWidgets),
    };

    return sendResponse(res, 200, true, 'Permission comparison loaded', diff);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

// ============ Workflow Builder ============

export const getWorkflows = async (req: AuthRequest, res: Response) => {
  try {
    const workflows = await Workflow.find({});
    return sendResponse(res, 200, true, 'Workflows retrieved successfully', workflows);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

export const updateWorkflow = async (req: AuthRequest, res: Response) => {
  try {
    const { requestType, steps, autoApprove, isActive } = req.body;
    const actor = req.user!;

    if (!requestType) {
      return sendResponse(res, 400, false, 'requestType is required.');
    }

    const workflow = await Workflow.findOneAndUpdate(
      { requestType },
      { steps, autoApprove, isActive },
      { new: true, upsert: true }
    );

    await logActivity(
      actor.id.toString(),
      actor.role,
      'Workflow Changed',
      requestType,
      `Approval workflow for '${requestType}' updated to: ${steps?.join(' -> ') || 'Auto approval'}`
    );

    return sendResponse(res, 200, true, 'Workflow updated successfully', workflow);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

// ============ Request Center ============

export const createRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestType, data } = req.body;
    const creator = req.user; // If logged in

    if (!requestType || !data) {
      return sendResponse(res, 400, false, 'requestType and data are required.');
    }

    // Resolve workflow config
    const workflow = await Workflow.findOne({ requestType, isActive: true });
    const steps = workflow ? workflow.steps : [];
    const autoApprove = workflow ? workflow.autoApprove : true;

    // Auto-generate temporary strong password for new staff applications if not provided
    let passwordBeforeApproval = data.password || generateStrongPassword();

    const newRequest = await RequestModel.create({
      requestType,
      data: { ...data, password: passwordBeforeApproval },
      workflowSteps: steps,
      currentStepIndex: 0,
      status: autoApprove ? RequestStatus.APPROVED : RequestStatus.PENDING,
      passwordBeforeApproval,
      createdBy: creator ? creator.id : 'self_registration',
      createdByRole: creator ? creator.role : 'public',
    });

    if (autoApprove) {
      // Immediately spawn user account if auto-approved
      await finalizeUserApproval(newRequest);
    }

    return sendResponse(
      res,
      201,
      true,
      autoApprove ? 'Request approved automatically.' : 'Request submitted, pending approvals.',
      newRequest
    );
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

export const listRequests = async (req: AuthRequest, res: Response) => {
  try {
    const { status, requestType } = req.query;
    const filter: any = {};
    if (status) filter.status = status;
    if (requestType) filter.requestType = requestType;

    const requests = await RequestModel.find(filter).sort({ createdAt: -1 });
    return sendResponse(res, 200, true, 'Requests listed successfully', requests);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

export const updateRequestPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const actor = req.user!;

    if (actor.role !== 'owner') {
      return sendResponse(res, 403, false, 'Only Owner can change passwords before approval.');
    }

    const requestObj = await RequestModel.findById(id);
    if (!requestObj) {
      return sendResponse(res, 404, false, 'Request not found');
    }

    requestObj.passwordBeforeApproval = password;
    requestObj.data.password = password;
    requestObj.markModified('data');
    await requestObj.save();

    return sendResponse(res, 200, true, 'Request password updated successfully by Owner.');
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

export const approveRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;
    const actor = req.user!;

    const requestObj = await RequestModel.findById(id);
    if (!requestObj) {
      return sendResponse(res, 404, false, 'Request not found.');
    }

    if (requestObj.status !== RequestStatus.PENDING) {
      return sendResponse(res, 400, false, `Request is already ${requestObj.status}.`);
    }

    // Determine target workflow role
    const targetRole = requestObj.workflowSteps[requestObj.currentStepIndex];

    // If workflow steps exist, verify current actor role matches the targetRole
    if (targetRole && actor.role !== 'owner' && actor.role !== targetRole) {
      return sendResponse(res, 430, false, `Verification failure: Current approval stage requires '${targetRole}' role.`);
    }

    // Record approval stamp
    requestObj.approvedBy = requestObj.approvedBy || [];
    requestObj.approvedBy.push({
      userId: actor.id,
      role: actor.role,
      date: new Date(),
      comments,
    });

    // Audit Log
    await logActivity(
      actor.id.toString(),
      actor.role,
      'Approval',
      (requestObj as any)._id.toString(),
      `Approved stage ${requestObj.currentStepIndex + 1}/${requestObj.workflowSteps.length} for request: ${requestObj.requestType}`
    );

    // Advance to next step or finalize
    if (requestObj.currentStepIndex + 1 >= requestObj.workflowSteps.length) {
      requestObj.status = RequestStatus.APPROVED;
      requestObj.approvedDate = new Date();
      await finalizeUserApproval(requestObj, actor);
    } else {
      requestObj.currentStepIndex += 1;
    }

    await requestObj.save();
    return sendResponse(res, 200, true, 'Approval step processed successfully.', requestObj);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

export const rejectRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const actor = req.user!;

    if (!reason) {
      return sendResponse(res, 400, false, 'Rejection reason is required.');
    }

    const requestObj = await RequestModel.findById(id);
    if (!requestObj) {
      return sendResponse(res, 404, false, 'Request not found.');
    }

    if (requestObj.status !== RequestStatus.PENDING) {
      return sendResponse(res, 400, false, `Request is already ${requestObj.status}.`);
    }

    requestObj.status = RequestStatus.REJECTED;
    requestObj.rejectedDate = new Date();
    requestObj.rejectedBy = {
      userId: actor.id,
      role: actor.role,
      date: new Date(),
      reason,
    };

    await requestObj.save();

    await logActivity(
      actor.id.toString(),
      actor.role,
      'Rejection',
      (requestObj as any)._id.toString(),
      `Rejected request type ${requestObj.requestType}. Reason: ${reason}`
    );

    return sendResponse(res, 200, true, 'Request rejected successfully.', requestObj);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

// ============ Helper: Create users after final workflow approval ============
const finalizeUserApproval = async (requestObj: IRequest, finalApprover?: any) => {
  const { requestType, data, passwordBeforeApproval } = requestObj;

  // Hash password
  const hashedPassword = await generateSecureHash(passwordBeforeApproval || 'Default@123');
  const newUserId = await generateUniqueId();

  let targetRole = 'user';
  if (requestType.toLowerCase().includes('admin')) targetRole = 'admin';
  else if (requestType.toLowerCase().includes('super admin')) targetRole = 'superAdmin';
  else if (requestType.toLowerCase().includes('operator')) targetRole = 'operator';
  else if (requestType.toLowerCase().includes('seller')) targetRole = 'coinSeller';
  else if (requestType.toLowerCase().includes('support')) targetRole = 'customerSupport';
  else if (requestType.toLowerCase().includes('agency')) targetRole = 'agency';
  else if (requestType.toLowerCase().includes('host')) targetRole = 'host';

  const specialCode = await generateSpecialCode(targetRole, data.name || 'User');
  const referralCode = `${targetRole.substring(0, 3).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // Automatically construct parenting tree
  let parentId: any = undefined;
  let parentRole: string | undefined = undefined;
  let ownerId: any = undefined;
  let operatorId: any = undefined;
  let superAdminId: any = undefined;
  let adminId: any = undefined;
  let agencyId: any = undefined;

  // Resolve hierarchy based on referral/parent links
  let referrerUser: any = null;
  if (data.referralCode) {
    // Host automatically joins correct agency via referral code
    referrerUser = await User.findOne({ referralCode: data.referralCode });
  } else if (finalApprover) {
    referrerUser = await User.findById(finalApprover.id);
  }

  if (referrerUser) {
    parentId = referrerUser._id;
    parentRole = referrerUser.role;

    // Inherit ancestors
    ownerId = referrerUser.ownerId || (referrerUser.role === 'owner' ? referrerUser._id : undefined);
    operatorId = referrerUser.operatorId || (referrerUser.role === 'operator' ? referrerUser._id : undefined);
    superAdminId = referrerUser.superAdminId || (referrerUser.role === 'superAdmin' ? referrerUser._id : undefined);
    adminId = referrerUser.adminId || (referrerUser.role === 'admin' ? referrerUser._id : undefined);
    agencyId = referrerUser.agencyId || (referrerUser.role === 'agency' ? referrerUser._id : undefined);

    // Save corresponding parent role IDs
    if (referrerUser.role === 'owner') ownerId = referrerUser._id;
    if (referrerUser.role === 'operator') operatorId = referrerUser._id;
    if (referrerUser.role === 'superAdmin') superAdminId = referrerUser._id;
    if (referrerUser.role === 'admin') adminId = referrerUser._id;
    if (referrerUser.role === 'agency') agencyId = referrerUser._id;
  }

  const newUser = await User.create({
    userId: newUserId,
    name: data.name,
    email: data.email?.toLowerCase(),
    phoneNumber: data.phoneNumber,
    password: hashedPassword,
    role: targetRole,
    gender: data.gender || 'other',
    emailVerified: true,
    isActive: true,
    employeeCode: specialCode, // Compatibility
    specialCode,
    referralCode,
    parentId,
    parentRole,
    referredBy: parentId,
    ownerId,
    operatorId,
    superAdminId,
    adminId,
    agencyId,
    documents: data.documents || [],
    sourceForm: requestType,
    device: {
      createdDeviceId: 'EMS_PORTAL',
      currentDeviceId: '',
      loggedInDeviceIds: [],
    },
  });

  // Assign Default Permission sets
  let defaultTemplate = await Permission.findOne({ targetType: 'role', targetId: targetRole });
  if (defaultTemplate) {
    await Permission.create({
      targetType: 'user',
      targetId: (newUser as any)._id.toString(),
      menus: defaultTemplate.menus,
      pages: defaultTemplate.pages,
      modules: defaultTemplate.modules,
      actions: defaultTemplate.actions,
      fields: defaultTemplate.fields,
      buttons: defaultTemplate.buttons,
      columns: defaultTemplate.columns,
      dashboardWidgets: defaultTemplate.dashboardWidgets,
    });
  }

  requestObj.userId = newUser.userId;
  await requestObj.save();
};

// ============ System Audit Logs ============

export const getAuditLogs = async (req: AuthRequest, res: Response) => {
  try {
    const logs = await AuditLog.find({})
      .populate('adminId', 'name email role')
      .sort({ createdAt: -1 });

    return sendResponse(res, 200, true, 'Audit logs retrieved', logs);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};
