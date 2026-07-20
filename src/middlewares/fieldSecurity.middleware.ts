import { Response, NextFunction } from 'express';
import { AuthRequest } from './authorize.middleware';
import { Permission } from '../models/permission.model';

/**
 * Middleware: Intercepts JSON responses and strips fields that the caller is not permitted to see.
 */
export const fieldSecurityFilter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user || user.role === 'owner') {
      return next(); // Owner has absolute clearance; bypass filtering
    }

    // 1. Fetch the permissions configuration (User override takes precedence over Role default)
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

    // If no permission policies are configured, proceed as normal
    if (!permissionObj || !permissionObj.fields || permissionObj.fields.size === 0) {
      return next();
    }

    // 2. Identify fields explicitly disabled (set to false)
    const blockedFields: string[] = [];
    permissionObj.fields.forEach((value, key) => {
      if (value === false) {
        blockedFields.push(key.toLowerCase());
      }
    });

    if (blockedFields.length === 0) {
      return next();
    }

    // 3. Helper function to clean data recursively
    const stripBlockedFields = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(stripBlockedFields);
      } else if (obj !== null && typeof obj === 'object') {
        // Handle Mongoose documents
        const cleanObj = typeof obj.toObject === 'function' ? obj.toObject() : { ...obj };
        
        for (const key of Object.keys(cleanObj)) {
          if (blockedFields.includes(key.toLowerCase())) {
            delete cleanObj[key];
          } else if (typeof cleanObj[key] === 'object' && cleanObj[key] !== null) {
            cleanObj[key] = stripBlockedFields(cleanObj[key]);
          }
        }
        return cleanObj;
      }
      return obj;
    };

    // 4. Override res.json to apply the filter
    const originalJson = res.json;
    res.json = function (body: any) {
      if (body && typeof body === 'object') {
        try {
          if (body.success && body.data) {
            // Strip fields inside standard API response structures: { success: true, data: ... }
            body.data = stripBlockedFields(body.data);
          } else {
            body = stripBlockedFields(body);
          }
        } catch (err) {
          console.error('[Field Security] Error stripping fields:', err);
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
