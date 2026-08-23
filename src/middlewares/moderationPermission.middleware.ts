import { Response, NextFunction } from "express";
import { AuthRequest } from "./authorize.middleware";
import sendResponse from "../utils/reponse";
import { Permission } from "../models/permission.model";

export function requireModerationPermission(requiredPermission: string = "moderation:view") {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return sendResponse(res, 401, false, "Unauthorized - Please log in");
      }

      const role = String(user.role || "").toLowerCase();
      if (role === "owner" || role === "superadmin") {
        return next();
      }

      // Query explicit RBAC permissions
      const userId = (user as any)._id || user.id;
      const perm = await Permission.findOne({
        $or: [
          { targetType: "user", targetId: String(userId) },
          { targetType: "role", targetId: user.role },
        ],
      }).lean();

      if (perm) {
        const allowedMenus = (perm.menus || []).map((m: string) => m.toLowerCase());
        const allowedButtons = (perm.buttons || []).map((b: string) => b.toLowerCase());

        const hasModeration =
          allowedMenus.some((m) => m.includes("moderation")) ||
          allowedButtons.some((b) => b.includes("moderation"));

        if (hasModeration) {
          return next();
        }
      }

      // Allow admin / operator for basic view if no explicit restriction
      if ((role === "admin" || role === "operator") && requiredPermission === "moderation:view") {
        return next();
      }

      return sendResponse(
        res,
        403,
        false,
        `Access Denied: Insufficient permissions for ${requiredPermission}`
      );
    } catch (err: any) {
      return sendResponse(res, 500, false, err?.message || "Error checking moderation permissions");
    }
  };
}
