export interface RoleDefinition {
  name: string;
  allowedRoutes: string[];
  allowedModules: string[];
  allowedActions: string[];
}

const SUPER_ADMIN_DENIED_ROUTES = [
  '/users',
  '/super-admins',
  '/avatar-requests',
  '/bios',
  '/host-management',
  '/recharges',
  '/withdrawals',
  '/sellers',
];

const ADMIN_DENIED_ROUTES = [
  '/users',
  '/super-admins',
  '/admins',
  '/avatar-requests',
  '/bios',
  '/host-management',
  '/recharges',
  '/withdrawals',
  '/sellers',
];

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
  '/sellers',
  '/deletions',
  '/bans',
  '/messages',
  '/kyc',
  '/withdrawals',
  '/moderation',
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
      '/users',
      '/recharges',
      '/recharges/user',
      '/recharges/seller',
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
      '/calls',
      '/cms',
      '/customer-support',
      '/customer-support/add',
      '/customer-support/create',
      '/customer-support/list',
      '/customer-support/request',
      '/employees',
      '/help-support',
      '/host-levels',
      '/host-management',
      '/hosts',
      '/hosts/add',
      '/hosts/create',
      '/avatar-requests',
      '/bios',
      '/hosts/request',
      '/moderation',
      '/profile',
      '/referrals',
      '/referrals/links',
      '/reports',
      '/rooms',
      '/super-admins',
      '/super-admins/create',
      '/super-admins/request',
      '/verification',
      '/verification/requests',
      '/vip',
    ],
    allowedModules: [
      'Dashboard',
      'Users',
      'Finance',
      'Recharge',
      'SuperAdmin',
      'Admin',
      'Agency',
      'Host',
      'CustomerSupport',
      'Verification',
      'Reports',
      'HelpSupport',
      'Settings',
      'Calls',
      'Rooms',
      'Banner',
      'HostLevels',
      'VIP',
      'Moderation',
      'CMS',
      'Ads',
      'Employees',
      'Profile',
    ],
    allowedActions: [
      'view', 'create', 'edit', 'update', 'delete',
      'approve', 'reject', 'block', 'unblock', 'moderate',
      'changeLevel', 'export', 'import',
      'search', 'reply', 'manage',
      'View', 'Create', 'Edit', 'Update', 'Delete',
      'Approve', 'Reject', 'Block', 'Unblock', 'Moderate',
      'Export', 'Import', 'Search', 'Reply', 'Manage',
    ],
  },
  superAdmin: {
    name: 'Super Admin',
    allowedRoutes: [
      '/dashboard',
      '/admins',
      '/admins/create',
      '/admins/request',
      '/agencies',
      '/agencies/create',
      '/agencies/request',
      '/hosts',
      '/hosts/create',
      '/hosts/request',
      '/customer-support',
      '/customer-support/create',
      '/customer-support/request',
      '/reports',
      '/help-support',
      '/referrals',
      '/referrals/links',
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
      'HelpSupport',
      'Settings',
      'Users',
      'Calls',
      'Rooms',
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
      '/agencies',
      '/agencies/create',
      '/agencies/request',
      '/hosts',
      '/hosts/create',
      '/hosts/request',
      '/customer-support',
      '/customer-support/create',
      '/customer-support/request',
      '/reports',
      '/help-support',
      '/referrals',
      '/referrals/links',
      '/profile',
    ],
    allowedModules: [
      'Dashboard',
      'Users',
      'Reports',
      'Settings',
      'Agency',
      'Host',
      'CustomerSupport',
      'HelpSupport',
      'Referrals',
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
      '/referrals',
      '/referrals/links',
      '/profile',
    ],
    allowedModules: [
      'Dashboard',
      'Users',
      'Settings',
      'Host',
      'Referrals',
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

  if (role === 'superAdmin' && SUPER_ADMIN_DENIED_ROUTES.some(
    (denied) => path === denied || path.startsWith(`${denied}/`)
  )) {
    return false;
  }

  if (role === 'admin' && ADMIN_DENIED_ROUTES.some(
    (denied) => path === denied || path.startsWith(`${denied}/`)
  )) {
    return false;
  }

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
