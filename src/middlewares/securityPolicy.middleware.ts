import { Request, Response, NextFunction } from 'express';
import { SecurityPolicy } from '../models/securityPolicy.model';

export async function enforceSecurityPolicies(req: Request, res: Response, next: NextFunction) {
    try {
        const policy = await SecurityPolicy.findOne().lean();
        if (!policy || !policy.ipAllowlist || policy.ipAllowlist.length === 0) {
            return next();
        }

        const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
        const cleanIp = clientIp.split(',')[0].trim();

        const isAllowed = policy.ipAllowlist.some(ip => ip === '*' || ip === cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1');

        if (!isAllowed) {
            return res.status(403).json({
                success: false,
                message: `Access denied: IP address ${cleanIp} is not in the enterprise allowlist`
            });
        }

        next();
    } catch {
        next();
    }
}
