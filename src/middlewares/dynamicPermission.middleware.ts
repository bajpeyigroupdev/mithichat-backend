import { Response, NextFunction } from 'express';
import { AuthRequest } from './authorize.middleware';
import { Permission } from '../models/permission.model';
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
 * Middleware: Dynamically verify a specific permission type and value
 */
export const checkPermission = (type: PermissionType, value: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return sendResponse(res, 401, false, 'Unauthorized - No user attached');
      }

      // Owner and superAdmin have full bypass access
      if (user.role === 'owner' || user.role === 'superAdmin') {
        return next();
      }


      // 1. Check individual user override
      let permission = await Permission.findOne({
        targetType: 'user',
        targetId: user.id.toString(),
      });

      // 2. Fall back to role permission if no user override exists
      if (!permission) {
        permission = await Permission.findOne({
          targetType: 'role',
          targetId: user.role,
        });
      }

      // If no permission rule is configured, deny by default (except for owner)
      if (!permission) {
        return sendResponse(res, 403, false, `Access Denied: No permissions configured for role '${user.role}'`);
      }

      // 3. Evaluate the array permissions
      const allowedList = (permission as any)[type] as string[];
      if (allowedList && Array.isArray(allowedList) && allowedList.includes(value)) {
        return next();
      }

      return sendResponse(res, 403, false, `Access Denied: Insufficient permissions for ${type} '${value}'`);
    } catch (error: any) {
      return sendResponse(res, 500, false, error.message || 'Error checking dynamic permissions');
    }
  };
};
