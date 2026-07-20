import { Request, Response, NextFunction } from 'express';

export function enforceTenantIsolation(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user;
    const headerOrgId = req.headers['x-organization-id'] as string;

    const orgId = headerOrgId || user?.orgId;

    if (orgId) {
        (req as any).tenantFilter = { orgId };
    } else {
        (req as any).tenantFilter = {};
    }

    next();
}
