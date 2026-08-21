export const APP_ACCOUNT_ROLES = ['user', 'host'] as const;

export const PANEL_ACCOUNT_ROLES = [
  'owner',
  'operator',
  'superAdmin',
  'admin',
  'agency',
  'coinSeller',
  'customerSupport',
] as const;

export const getAccountRoleScope = (role: string): string[] =>
  APP_ACCOUNT_ROLES.includes(role as (typeof APP_ACCOUNT_ROLES)[number])
    ? [...APP_ACCOUNT_ROLES]
    : [...PANEL_ACCOUNT_ROLES];
