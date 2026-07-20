import { Request, Response } from 'express';
import { AuditLog } from '../models/auditLog.model';
import { RecruitmentApplication } from '../models/recruitmentApplication.model';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

export const getActivityFeed = async (req: Request, res: Response) => {
    try {
        const [auditLogs, recentApps] = await Promise.all([
            AuditLog.find().sort({ createdAt: -1 }).limit(10).lean(),
            RecruitmentApplication.find().sort({ updatedAt: -1 }).limit(10).lean()
        ]);

        const feed = [
            ...auditLogs.map(log => ({
                id: log._id,
                module: 'Security',
                title: log.action,
                details: log.details || log.target,
                ipAddress: log.ipAddress,
                timestamp: log.createdAt
            })),
            ...recentApps.map(app => ({
                id: app._id,
                module: 'Recruitment',
                title: `Application ${app.applicationId} - ${app.status.toUpperCase()}`,
                details: `Applicant: ${app.applicant?.name} (${app.role.toUpperCase()})`,
                timestamp: app.updatedAt
            }))
        ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return sendResponse(res, 200, true, 'Activity feed retrieved', feed.slice(0, 15));
    } catch (error: any) {
        await Logger('getActivityFeed', error);
        return sendResponse(res, 500, false, 'Failed to fetch activity feed');
    }
};
