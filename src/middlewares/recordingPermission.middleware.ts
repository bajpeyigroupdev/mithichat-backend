import { NextFunction, Response } from 'express';
import { AuthRequest } from './authorize.middleware';
import { Permission } from '../models/permission.model';
import sendResponse from '../utils/reponse';

export type RecordingPermission = 'view' | 'playback' | 'download' | 'review' | 'delete' | 'settings';

export function canAccessRecording(role: string, action: RecordingPermission, menus: string[] = [], buttons: string[] = []) {
  if (role === 'owner') return true;
  if (action === 'view' && ['superAdmin', 'admin', 'operator'].includes(role)) return true;
  const normalizedMenus = menus.map((value) => value.toLowerCase());
  const normalizedButtons = buttons.map((value) => value.toLowerCase());
  const hasModule = normalizedMenus.includes('*') || normalizedMenus.includes('recordings') || normalizedMenus.includes('recording');
  const hasAction = normalizedButtons.includes('*') || normalizedButtons.includes(action) || (action === 'view' && normalizedButtons.includes('read'));
  return hasModule && hasAction;
}

export function requireRecordingPermission(action: RecordingPermission) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return sendResponse(res, 401, false, 'Unauthorized');
    if (user.role === 'owner') return next();

    const permission = await Permission.findOne({
      $or: [
        { targetType: 'user', targetId: String(user.id) },
        { targetType: 'role', targetId: user.role },
      ],
    }).lean();
    if (canAccessRecording(user.role, action, permission?.menus || [], permission?.buttons || [])) return next();
    return sendResponse(res, 403, false, `Recording permission required: ${action}`);
  };
}
