import { Response, NextFunction } from 'express';
import { AuthRequest } from './authorize.middleware';
import { PermissionEngine } from '../utils/permissionEngine';
import sendResponse from '../utils/reponse';

export type PermissionType = 
  | 'menus' 
  | 'pages' 
  | 'modules' 
  | 'actions' 
  | 'buttons' 
  | 'dashboardWidgets' 
  | 'exports' 
  | 'imports' 
  | 'reports' 
  | 'notifications' 
  | 'finance' 
  | 'settings' 
  | 'developer';

/**
 * Middleware: Dynamically verify a specific permission type and value using centralized PermissionEngine.
 */
export const checkPermission = (type: PermissionType, value: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return sendResponse(res, 401, false, 'Unauthorized - No user attached');
      }

      if (user.role === 'owner') {
        return next();
      }

      let isAllowed = false;
      if (type === 'pages' || type === 'modules' || type === 'menus') {
        isAllowed = await PermissionEngine.canAccessPage(user, value);
      } else if (type === 'actions') {
        isAllowed = await PermissionEngine.canAccessAction(user, '', value);
      } else if (type === 'buttons') {
        isAllowed = await PermissionEngine.canAccessButton(user, '', value);
      } else if (type === 'dashboardWidgets') {
        isAllowed = await PermissionEngine.canAccessWidget(user, '', value);
      } else {
        isAllowed = await PermissionEngine.canAccessAction(user, '', value);
      }

      if (isAllowed) {
        return next();
      }

      return sendResponse(res, 403, false, `Access Denied: Insufficient permissions for ${type} '${value}'`);
    } catch (error: any) {
      return sendResponse(res, 500, false, error.message || 'Error checking dynamic permissions');
    }
  };
};
