import { Request, Response, NextFunction } from 'express';
import { ApiKey } from '../models/apiKey.model';

export async function apiGatewayMiddleware(req: Request, res: Response, next: NextFunction) {
    const apiKeyHeader = req.headers['x-api-key'] as string;

    if (!apiKeyHeader) {
        return next(); // Default session auth flow if API key header is absent
    }

    try {
        const keyRecord = await ApiKey.findOne({ apiKey: apiKeyHeader, isActive: true }).lean();
        if (!keyRecord) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or revoked API Key'
            });
        }

        (req as any).apiKeyRecord = keyRecord;
        next();
    } catch {
        return res.status(500).json({ success: false, message: 'API Gateway authentication error' });
    }
}
