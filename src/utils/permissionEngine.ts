import { Permission } from '../models/permission.model';
import { PermissionCache } from './permissionCache';

export const evaluateABACRule = (rule: any, context: any): boolean => {
  if (!rule) return true;

  if (rule.logical === 'AND' && rule.conditions) {
    return rule.conditions.every((c: any) => evaluateABACRule(c, context));
  }
  if (rule.logical === 'OR' && rule.conditions) {
    return rule.conditions.some((c: any) => evaluateABACRule(c, context));
  }

  const contextVal = context[rule.field];
  const targetVal = rule.value;

  switch (rule.operator) {
    case '==': return contextVal == targetVal;
    case '!=': return contextVal != targetVal;
    case '>': return Number(contextVal) > Number(targetVal);
    case '<': return Number(contextVal) < Number(targetVal);
    case '>=': return Number(contextVal) >= Number(targetVal);
    case '<=': return Number(contextVal) <= Number(targetVal);
    case 'contains': return String(contextVal).includes(String(targetVal));
    case 'startsWith': return String(contextVal).startsWith(String(targetVal));
    case 'endsWith': return String(contextVal).endsWith(String(targetVal));
    default: return false;
  }
};

const fetchPolicy = async (userContext: any) => {
  if (!userContext || !userContext.id) return null;
  const orgId = userContext.orgId ? userContext.orgId.toString() : undefined;

  // 1. Fetch user override policy
  let policy = await PermissionCache.getOrSet('user', userContext.id.toString(), orgId, async () => {
    return await Permission.findOne({ targetType: 'user', targetId: userContext.id.toString() });
  });

  // 2. Fallback to base role default policy
  if (!policy && userContext.role) {
    policy = await PermissionCache.getOrSet('role', userContext.role, orgId, async () => {
      return await Permission.findOne({ targetType: 'role', targetId: userContext.role });
    });
  }

  // 3. Check expiration
  if (policy && policy.expiresAt && new Date(policy.expiresAt).getTime() < Date.now()) {
    return null;
  }

  return policy;
};

export class PermissionEngine {
  public static async canAccessPage(userContext: any, pageId: string): Promise<boolean> {
    if (userContext.role === 'owner') return true;
    const policy = await fetchPolicy(userContext);
    if (!policy) return false;

    // Evaluate ABAC rules matching pageId
    const abacRules = policy.abacRules || [];
    const pageRules = abacRules.filter((r: any) => r.action === pageId || r.pageId === pageId);
    for (const r of pageRules) {
      if (!evaluateABACRule(r, userContext)) return false;
    }

    return policy.pages?.includes(pageId) || policy.modules?.includes(pageId) || false;
  }

  public static async canAccessAction(userContext: any, pageId: string, actionId: string): Promise<boolean> {
    if (userContext.role === 'owner') return true;
    const policy = await fetchPolicy(userContext);
    if (!policy) return false;

    // Evaluate ABAC rules matching actionId
    const abacRules = policy.abacRules || [];
    const actionRules = abacRules.filter((r: any) => r.action === actionId);
    for (const r of actionRules) {
      if (!evaluateABACRule(r, userContext)) return false;
    }

    return policy.actions?.includes(actionId) || false;
  }

  public static async canAccessField(userContext: any, pageId: string, fieldKey: string): Promise<boolean> {
    if (userContext.role === 'owner') return true;
    const policy = await fetchPolicy(userContext);
    if (!policy) return false;

    const mapKey = pageId === 'users' ? 'user' : pageId;
    
    // Check columns mapping restriction
    if (policy.columns) {
      const allowed = (policy.columns instanceof Map ? policy.columns.get(mapKey) : (policy.columns as any)[mapKey]) || [];
      if (allowed.length > 0 && !allowed.includes(fieldKey)) {
        return false;
      }
    }

    // Check fields visibility map restriction
    if (policy.fields) {
      const isBlocked = policy.fields instanceof Map ? policy.fields.get(fieldKey) === false : (policy.fields as any)[fieldKey] === false;
      if (isBlocked) return false;
    }

    return true;
  }

  public static async canAccessButton(userContext: any, pageId: string, buttonKey: string): Promise<boolean> {
    if (userContext.role === 'owner') return true;
    const policy = await fetchPolicy(userContext);
    if (!policy) return false;

    const key = `${pageId}_buttons`;
    const allowed = (policy.columns instanceof Map ? policy.columns.get(key) : (policy.columns as any)[key]) || [];
    return allowed.includes(buttonKey);
  }

  public static async canAccessFilter(userContext: any, pageId: string, filterKey: string): Promise<boolean> {
    if (userContext.role === 'owner') return true;
    const policy = await fetchPolicy(userContext);
    if (!policy) return false;

    const key = `${pageId}_filters`;
    const allowed = (policy.columns instanceof Map ? policy.columns.get(key) : (policy.columns as any)[key]) || [];
    return allowed.includes(filterKey);
  }

  public static async canAccessTab(userContext: any, pageId: string, tabKey: string): Promise<boolean> {
    if (userContext.role === 'owner') return true;
    const policy = await fetchPolicy(userContext);
    if (!policy) return false;

    const key = `${pageId}_tabs`;
    const allowed = (policy.columns instanceof Map ? policy.columns.get(key) : (policy.columns as any)[key]) || [];
    return allowed.includes(tabKey);
  }

  public static async canAccessWidget(userContext: any, pageId: string, widgetKey: string): Promise<boolean> {
    if (userContext.role === 'owner') return true;
    const policy = await fetchPolicy(userContext);
    if (!policy) return false;

    const key = `${pageId}_widgets`;
    const allowed = (policy.columns instanceof Map ? policy.columns.get(key) : (policy.columns as any)[key]) || [];
    return allowed.includes(widgetKey);
  }

  public static async canAccessSection(userContext: any, sectionId: string): Promise<boolean> {
    return this.canAccessPage(userContext, sectionId);
  }

  public static async canAccessRoute(userContext: any, routePath: string): Promise<boolean> {
    if (userContext.role === 'owner') return true;
    const cleaned = routePath.replace(/^\//, '').split('/')[0];
    return this.canAccessPage(userContext, cleaned || 'dashboard');
  }

  public static async canAccessAPI(userContext: any, apiEndpoint: string, method: string): Promise<boolean> {
    if (userContext.role === 'owner') return true;
    let action = 'View';
    if (method === 'POST') action = 'Create';
    if (method === 'PUT' || method === 'PATCH') action = 'Edit';
    if (method === 'DELETE') action = 'Delete';

    const cleaned = apiEndpoint.replace(/^\/api\//, '').split('/')[0];
    const targetAction = `${action} ${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}`;
    return this.canAccessAction(userContext, cleaned, targetAction);
  }

  public static async hasModerationPermission(
    userContext?: { id?: any; _id?: any; role?: string; permissions?: string[] } | null,
    actionName: 'view' | 'review' | 'action' | 'unmute' = 'view'
  ): Promise<boolean> {
    if (!userContext) return false;
    const role = String(userContext.role || '').toLowerCase();

    // Owner and SuperAdmin have master access
    if (role === 'owner' || role === 'superadmin') {
      return true;
    }

    // Only admin and operator roles are eligible for permission evaluation
    if (role !== 'admin' && role !== 'operator') {
      return false;
    }

    const targetPerm = `moderation:${actionName}`;

    // Check explicit userContext.permissions if populated
    if (userContext.permissions && Array.isArray(userContext.permissions)) {
      const reqPerms = userContext.permissions;
      return (
        reqPerms.includes(targetPerm) ||
        reqPerms.includes('moderation:view') ||
        reqPerms.includes('moderation:*') ||
        reqPerms.includes('*')
      );
    }

    // Check DB connection readiness
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return actionName === 'view';
    }

    // Query verified DB Permission policy
    const userId = userContext.id ? String(userContext.id) : (userContext._id ? String(userContext._id) : undefined);
    const policy = await fetchPolicy({ id: userId, role: userContext.role });
    if (!policy) {
      // Default: Allow basic view for admin/operator roles if no restrictive policy exists
      return actionName === 'view';
    }

    const actions = policy.actions || [];
    const pages = policy.pages || [];
    const modules = policy.modules || [];
    const menus = policy.menus || [];

    const hasAction = actions.some(
      (a: string) =>
        a.toLowerCase() === targetPerm.toLowerCase() ||
        a.toLowerCase() === 'moderation:view' ||
        a.toLowerCase() === 'moderation'
    );
    const hasPage = pages.some(
      (p: string) => p.includes('moderation') || p.includes('violations')
    );
    const hasModule = modules.some((m: string) => m.toLowerCase() === 'moderation');
    const hasMenu = menus.some(
      (m: string) => m.toLowerCase() === 'notifications' || m.toLowerCase() === 'moderation'
    );

    return hasAction || hasPage || hasModule || hasMenu;
  }
}
