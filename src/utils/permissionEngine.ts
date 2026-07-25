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
}
