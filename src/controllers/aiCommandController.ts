import { Response } from 'express';
import { AuthRequest } from '../middlewares/authorize.middleware';
import { executeAdminCommand, getOperationsSnapshot } from '../services/adminOperationsService';
import { AuditLog } from '../models/auditLog.model';
import sendResponse from '../utils/reponse';

export async function getAdminOperationsSnapshot(_req: AuthRequest, res: Response) {
  try { return sendResponse(res, 200, true, 'Operations snapshot fetched', await getOperationsSnapshot()); }
  catch (error: any) { return sendResponse(res, 500, false, error?.message || 'Failed to fetch snapshot'); }
}

export async function askAdminCommand(req: AuthRequest, res: Response) {
  try {
    const query = String(req.body?.query || '');
    const data = await executeAdminCommand(query);
    await AuditLog.create({ adminId: req.user!.id, action: 'AI_COMMAND_QUERY', target: 'platform', ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0], details: `Read-only admin command (${query.length} chars)` });
    return sendResponse(res, 200, true, 'Command completed', data);
  } catch (error: any) { return sendResponse(res, error?.statusCode || 500, false, error?.message || 'Command failed'); }
}
