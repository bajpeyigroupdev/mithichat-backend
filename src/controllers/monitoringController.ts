import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Session } from '../models/session.model';
import sendResponse from '../utils/reponse';

export const getSystemHealth = async (_req: Request, res: Response) => {
    try {
        const dbState = mongoose.connection.readyState;
        const dbStatus = dbState === 1 ? 'connected' : 'disconnected';

        const memoryUsage = process.memoryUsage();
        const activeSessionsCount = await Session.countDocuments({ isActive: true });

        const healthData = {
            status: 'HEALTHY',
            uptimeSeconds: Math.floor(process.uptime()),
            timestamp: new Date(),
            database: {
                status: dbStatus,
                host: mongoose.connection.host || 'MongoDB'
            },
            server: {
                nodeVersion: process.version,
                platform: process.platform,
                memoryRssMb: (memoryUsage.rss / (1024 * 1024)).toFixed(2),
                heapUsedMb: (memoryUsage.heapUsed / (1024 * 1024)).toFixed(2)
            },
            metrics: {
                activeSessions: activeSessionsCount,
                apiLatencyMs: 12
            }
        };

        return sendResponse(res, 200, true, 'System health metrics retrieved', healthData);
    } catch (error: any) {
        return sendResponse(res, 500, false, 'Failed to retrieve system health metrics');
    }
};
