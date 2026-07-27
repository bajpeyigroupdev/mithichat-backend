export interface RoleDefinition {
  name: string;
  allowedRoutes: string[];
  allowedModules: string[];
  allowedActions: string[];
}

export const ROLE_PERMISSION_MATRIX: Record<string, RoleDefinition> = {
  owner: {
    name: 'Owner',
    allowedRoutes: ['*'],
    allowedModules: ['*'],
    allowedActions: ['*'],
  },

  operator: {
    name: 'Operator',
    allowedRoutes: [
      '/dashboard',
      '/super-admins',
      '/super-admins/request',
      '/admins',
      '/admins/request',
      '/agencies',
      '/agencies/request',
      '/hosts',
      '/hosts/request',
      '/host-management',
      '/sellers',
      '/sellers/request',
      '/customer-support',
      '/customer-support/request',
      '/users',
      '/verification/requests',
      '/kyc',
      '/reports',
      '/help-support',
      '/calls',
      '/rooms',
      '/recharges/user',
      '/recharges/seller',
      '/messages/system',
      '/messages/activity',
      '/events',
      '/security/audit',
      '/banners',
      '/host-levels',
      '/vip',
      '/withdrawals',
      '/bans/id',
      '/bans/device',
      '/deletions',
      '/profile',
    ],
    allowedModules: [
      'Dashboard',
      'SuperAdmin',
      'Admin',
      'Agency',
      'Host',
      'Seller',
      'CustomerSupport',
      'Users',
      'Verification',
      'Reports',
      'Calls',
      'Rooms',
      'WalletMonitoring',
      'Notifications',
      'AuditView',
      'Banner',
      'HostLevels',
      'VIP',
      'Withdrawals',
      'Moderation',
      'Profile',
    ],
    allowedActions: [
      'view',
      'edit',
      'approve',
      'reject',
      'moderate',
      'idBan',
      'deviceBan',
      'changeLevel',
      'export',
    ],
  },

  superAdmin: {
    name: 'Super Admin',
    allowedRoutes: [
      '/dashboard',
      '/admins/create',
      '/admins/request',
      '/admins',
      '/agencies/create',
      '/agencies/request',
      '/agencies',
      '/hosts/create',
      '/hosts/request',
      '/hosts',
      '/host-management',
      '/customer-support/create',
      '/customer-support/request',
      '/customer-support',
      '/verification/requests',
      '/kyc',
      '/reports',
      '/help-support',
      '/calls',
      '/rooms',
      '/users',
      '/messages/system',
      '/messages/activity',
      '/events',
      '/profile',
    ],
    allowedModules: [
      'Dashboard',
      'Admin',
      'Agency',
      'Host',
      'CustomerSupport',
      'Verification',
      'Reports',
      'Calls',
      'Rooms',
      'Users',
      'Notifications',
      'Profile',
    ],
    allowedActions: [
      'view',
      'create',
      'edit',
      'approve',
      'reject',
      'export',
      'idBan',
      'deviceBan',
      'changeLevel',
    ],
  },

  admin: {
    name: 'Admin',
    allowedRoutes: [
      '/dashboard',
      '/agencies/create',
      '/agencies/request',
      '/agencies',
      '/hosts/create',
      '/hosts/request',
      '/hosts',
      '/host-management',
      '/customer-support/create',
      '/customer-support/request',
      '/customer-support',
      '/verification/requests',
      '/kyc',
      '/reports',
      '/help-support',
      '/banners',
      '/calls',
      '/rooms',
      '/profile',
    ],
    allowedModules: [
      'Dashboard',
      'Agency',
      'Host',
      'CustomerSupport',
      'Verification',
      'Reports',
      'Banners',
      'Calls',
      'Rooms',
      'Profile',
    ],
    allowedActions: [
      'view',
      'create',
      'edit',
      'approve',
      'reject',
      'export',
    ],
  },

  agency: {
    name: 'Agency',
    allowedRoutes: [
      '/dashboard',
      '/hosts/create',
      '/hosts/request',
      '/hosts',
      '/my-hosts',
      '/host-management',
      '/agency/wallet',
      '/wallet',
      '/agency/commission',
      '/commission',
      '/agency/reports',
      '/reports',
      '/profile',
    ],
    allowedModules: [
      'Dashboard',
      'Host',
      'Wallet',
      'Commission',
      'Reports',
      'Profile',
    ],
    allowedActions: [
      'view',
      'create',
      'edit',
      'export',
    ],
  },

  host: {
    name: 'Host',
    allowedRoutes: [], // Web Login Disabled (HTTP 403)
    allowedModules: [],
    allowedActions: [],
  },

  coinSeller: {
    name: 'Coin Seller',
    allowedRoutes: [
      '/dashboard',
      '/seller/wallet',
      '/wallet',
      '/recharges/user',
      '/recharges/seller',
      '/seller/transactions',
      '/transactions',
      '/seller/reports',
      '/reports',
      '/profile',
    ],
    allowedModules: [
      'Dashboard',
      'Wallet',
      'Recharge',
      'Transactions',
      'Reports',
      'Profile',
    ],
    allowedActions: [
      'view',
      'recharge',
      'export',
    ],
  },

  customerSupport: {
    name: 'Customer Support',
    allowedRoutes: [
      '/dashboard',
      '/help-support',
      '/support-tickets',
      '/users',
      '/reports',
      '/complaints',
      '/profile',
    ],
    allowedModules: [
      'Dashboard',
      'CustomerSupport',
      'UserSearch',
      'Complaints',
      'Reports',
      'Profile',
    ],
    allowedActions: [
      'view',
      'search',
      'reply',
      'export',
    ],
  },
};

/**
 * Check if a route is allowed for a given role
 */
export const isRouteAllowed = (role: string, route: string): boolean => {
  const roleDef = ROLE_PERMISSION_MATRIX[role];
  if (!roleDef) return false;
  if (roleDef.allowedRoutes.includes('*')) return true;

  const path = route.split('?')[0].split('#')[0];

  return roleDef.allowedRoutes.some((allowed) => {
    if (allowed === path) return true;
    if (allowed.endsWith('/*') && path.startsWith(allowed.slice(0, -2))) return true;
    if (path.startsWith(allowed + '/')) return true;
    return false;
  });
};

/**
 * Check if an action is permitted for a role on a module
 */
export const hasPermission = (role: string, moduleName: string, actionName: string): boolean => {
  const roleDef = ROLE_PERMISSION_MATRIX[role];
  if (!roleDef) return false;
  if (roleDef.allowedActions.includes('*')) return true;

  const moduleMatch = roleDef.allowedModules.includes('*') || roleDef.allowedModules.includes(moduleName);
  const actionMatch = roleDef.allowedActions.includes(actionName) || roleDef.allowedActions.includes('manage');

  return moduleMatch && actionMatch;
};
