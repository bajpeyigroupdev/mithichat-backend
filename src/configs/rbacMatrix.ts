export interface RoleDefinition {
  name: string;
  allowedRoutes: string[];
  allowedModules: string[];
  allowedActions: string[];
}

const OPERATOR_DENIED_ROUTES = [
  '/operators',
  '/organization',
  '/tasks',
  '/events',
  '/settings',
  '/security',

  '/ai',
  '/analytics/live-map',
  '/health',
  '/owner',
  '/finance/ledger',
  '/compliance',
  '/logs',
  '/api-center',
];

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
      '/admins',
      '/admins/add',
      '/admins/create',
      '/admins/request',
      '/ads',
      '/agencies',
      '/agencies/add',
      '/agencies/create',
      '/agencies/request',
      '/banners',
      '/bans/device',
      '/bans/id',
      '/calls',
      '/cms',
      '/customer-support',
      '/customer-support/add',
      '/customer-support/create',
      '/customer-support/list',
      '/customer-support/request',
      '/deletions',
      '/employees',
      '/help-support',
      '/host-levels',
      '/host-management',
      '/hosts',
      '/hosts/add',
      '/hosts/create',
      '/hosts/request',
      '/kyc',
      '/messages/activity',
      '/messages/system',
      '/moderation',


      '/profile',
      '/recharges/seller',
      '/recharges/user',
      '/referrals',
      '/referrals/links',
      '/reports',
      '/rooms',
      '/sellers',
      '/sellers/add',
      '/sellers/create',
      '/sellers/request',
      '/super-admins',
      '/super-admins/create',
      '/super-admins/request',
      '/users',
      '/users/add',
      '/users/new',
      '/verification',
      '/verification/requests',
      '/vip',
      '/withdrawals',
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
      'Banner',
      'HostLevels',
      'VIP',
      'Withdrawals',
      'Moderation',
      'Recharge',
      'Finance',
      'CMS',
      'Ads',
      'Employees',
      'HelpSupport',
      'Deletions',
      'Profile',
    ],
    allowedActions: [
      'view', 'create', 'edit', 'update', 'delete',
      'approve', 'reject', 'block', 'unblock', 'moderate',
      'idBan', 'deviceBan', 'changeLevel', 'export', 'import',
      'recharge', 'search', 'reply', 'manage',
      'View', 'Create', 'Edit', 'Update', 'Delete',
      'Approve', 'Reject', 'Block', 'Unblock', 'Moderate',
      'Export', 'Import', 'Recharge', 'Search', 'Reply', 'Manage',
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

  if (role === 'operator' && OPERATOR_DENIED_ROUTES.some(
    (denied) => path === denied || path.startsWith(`${denied}/`)
  )) {
    return false;
  }

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
