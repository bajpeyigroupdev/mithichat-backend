import { Request, Response } from 'express';
import { Session } from '../models/session.model';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

export const getActiveSessions = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?._id;
        if (!userId) {
            return sendResponse(res, 401, false, 'Unauthorized');
        }

        const sessions = await Session.find({ userId, isActive: true }).sort({ lastActiveAt: -1 }).lean();
        return sendResponse(res, 200, true, 'Active sessions retrieved', sessions);
    } catch (error: any) {
        await Logger('getActiveSessions', error);
        return sendResponse(res, 500, false, 'Failed to fetch sessions');
    }
};

export const revokeSession = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?._id;
        const { sessionId } = req.params;

        const session = await Session.findOneAndUpdate(
            { _id: sessionId, userId },
            { isActive: false },
            { new: true }
        );

        if (!session) {
            return sendResponse(res, 404, false, 'Session not found');
        }

        return sendResponse(res, 200, true, 'Session revoked successfully');
    } catch (error: any) {
        await Logger('revokeSession', error);
        return sendResponse(res, 500, false, 'Failed to revoke session');
    }
};

export const forceLogoutAllDevices = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?._id;
        await Session.updateMany({ userId, isActive: true }, { isActive: false });
        return sendResponse(res, 200, true, 'Logged out from all active devices');
    } catch (error: any) {
        await Logger('forceLogoutAllDevices', error);
        return sendResponse(res, 500, false, 'Failed to perform force logout');
    }
};
