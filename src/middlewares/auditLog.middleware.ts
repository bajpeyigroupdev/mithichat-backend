import { Request, Response, NextFunction } from 'express';
import { AuditLog } from '../models/auditLog.model';

export function auditLogger(actionName: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

        res.on('finish', async () => {
            if (res.statusCode >= 200 && res.statusCode < 400 && user) {
                try {
                    await AuditLog.create({
                        adminId: user._id,
                        action: actionName,
                        target: req.originalUrl,
                        ipAddress: ipAddress.split(',')[0],
                        details: `Method: ${req.method} | Status: ${res.statusCode} | UA: ${req.headers['user-agent'] || 'Unknown'}`
                    });
                } catch {
                    // Ignore background audit logging failures
                }
            }
        });

        next();
    };
}
