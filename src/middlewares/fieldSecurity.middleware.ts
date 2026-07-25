import { Response, NextFunction } from 'express';
import { AuthRequest } from './authorize.middleware';
import { Permission } from '../models/permission.model';

/**
 * Reusable function to filter out unauthorized fields from single objects, arrays, nested structures, pagination, or aggregate results.
 */
export const applyFieldPermissions = (data: any, blockedFields: string[]): any => {
  if (data === null || data === undefined || blockedFields.length === 0) {
    return data;
  }

  const normalizedBlocked = blockedFields.map(f => f.toLowerCase());

  const stripFields = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
      return obj.map(stripFields);
    } else if (typeof obj === 'object') {
      // Handle Mongoose document conversion
      const cleanObj = typeof obj.toObject === 'function' ? obj.toObject() : { ...obj };

      // Handle Pagination results: { docs: [...], totalDocs: 100, page: 1 }
      if (cleanObj.docs && Array.isArray(cleanObj.docs)) {
        cleanObj.docs = cleanObj.docs.map(stripFields);
        return cleanObj;
      }
      // Handle alternative Pagination results: { results: [...], totalCount: 100 }
      if (cleanObj.results && Array.isArray(cleanObj.results)) {
        cleanObj.results = cleanObj.results.map(stripFields);
        return cleanObj;
      }

      for (const key of Object.keys(cleanObj)) {
        if (normalizedBlocked.includes(key.toLowerCase())) {
          delete cleanObj[key];
        } else if (typeof cleanObj[key] === 'object' && cleanObj[key] !== null) {
          cleanObj[key] = stripFields(cleanObj[key]);
        }
      }
      return cleanObj;
    }
    return obj;
  };

  return stripFields(data);
};

/**
 * Middleware: Intercepts JSON responses and strips fields that the caller is not permitted to see.
 */
export const fieldSecurityFilter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user || user.role === 'owner') {
      return next(); // Owner bypasses filtering
    }

    // 1. Fetch active permissions policy (User override takes precedence over Role)
    let permissionObj = await Permission.findOne({
      targetType: 'user',
      targetId: user.id.toString(),
    });

    if (!permissionObj) {
      permissionObj = await Permission.findOne({
        targetType: 'role',
        targetId: user.role,
      });
    }

    if (!permissionObj || !permissionObj.fields || permissionObj.fields.size === 0) {
      return next();
    }

    // 2. Identify disabled fields (set to false)
    const blockedFields: string[] = [];
    permissionObj.fields.forEach((value, key) => {
      if (value === false) {
        blockedFields.push(key.toLowerCase());
      }
    });

    if (blockedFields.length === 0) {
      return next();
    }

    // 3. Override res.json to filter payload automatically
    const originalJson = res.json;
    res.json = function (body: any) {
      if (body && typeof body === 'object') {
        try {
          if (body.success && body.data !== undefined) {
            body.data = applyFieldPermissions(body.data, blockedFields);
          } else {
            body = applyFieldPermissions(body, blockedFields);
          }
        } catch (err) {
          console.error('[Field Security] Interceptor failed to filter:', err);
        }
      }
      return originalJson.call(this, body);
    };

    next();
  } catch (error) {
    console.error('[Field Security Middleware Error]:', error);
    next();
  }
};
