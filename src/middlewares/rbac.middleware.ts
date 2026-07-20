import { Request, Response, NextFunction } from 'express';
import { Permission } from '../models/permission.model';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

export function requirePermission(moduleName: string, actionName: string = 'View') {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = (req as any).user;
            if (!user) {
                return sendResponse(res, 401, false, 'Unauthorized. Please login.');
            }

            const role = (user.role || '').toLowerCase();
            // Owner and SuperAdmin have automatic master access
            if (role === 'owner' || role === 'superadmin') {
                return next();
            }

            // Query explicit permissions assigned to user or user's role
            const userPerm = await Permission.findOne({
                $or: [
                    { targetType: 'user', targetId: user._id.toString() },
                    { targetType: 'role', targetId: user.role }
                ]
            }).lean();

            if (!userPerm) {
                // Default fallback: allow basic View if allowed role
                if (actionName === 'View') {
                    return next();
                }
                return sendResponse(res, 403, false, `Access Denied: Insufficient permissions for ${moduleName} (${actionName})`);
            }

            // Evaluate Menu & Action permissions
            const allowedMenus = userPerm.menus || [];
            const allowedButtons = userPerm.buttons || [];

            const isMenuAllowed = allowedMenus.some(m => m.toLowerCase() === moduleName.toLowerCase());
            const isButtonAllowed = allowedButtons.some(b => b.toLowerCase() === actionName.toLowerCase());

            if (allowedMenus.length > 0 && !isMenuAllowed) {
                return sendResponse(res, 403, false, `Access Denied: Module '${moduleName}' is not permitted for your role.`);
            }

            if (actionName !== 'View' && allowedButtons.length > 0 && !isButtonAllowed) {
                return sendResponse(res, 403, false, `Access Denied: Action '${actionName}' on '${moduleName}' is restricted.`);
            }

            return next();
        } catch (error: any) {
            await Logger('requirePermission', error);
            return sendResponse(res, 500, false, 'Internal server error validating RBAC permissions');
        }
    };
}
