import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import jwt, { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { User } from "../models/user.model";
import sendResponse from "../utils/reponse";
import { config } from "../configs/envConfig";




export interface AuthRequest extends Request {
  user?: {
    role: "owner" | "operator" | "superAdmin" | "admin" | "agency" | "coinSeller" | "customerSupport" | "host" | "user";
    userId: number;
    id: Types.ObjectId;
    name: string;
    gender: string;
    coins: number;
    diamonds: number;
    userName: string;
    isUserName: boolean;
    image: string;
    meethiId?: string;
    employeeCode?: string;
    orgId?: any;
  };
}


/**
 * Middleware: Verify JWT Token & Attach User to Request
 */
export const verifyToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Extract token from Authorization header OR query parameter
  const token = req.header("Authorization")?.split(" ")[1] || req.query.token as string;
  // console.log("Authorization header:", req.header("Authorization"));
  // console.log("Extracted token:", token);

  if (!token) {
    return sendResponse(res, 401, false, "Unauthorized - No token provided");
  }
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET as string) as any;
    const targetUserId = decoded?.userId ? (typeof decoded.userId === 'number' ? decoded.userId : parseInt(decoded.userId, 10)) : null;

    if (!targetUserId && !decoded?._id) {
      return sendResponse(res, 401, false, "Unauthorized - Invalid token payload");
    }

    // Explicitly exclude sensitive fields
    const user = await User.findOne({
      $or: [
        ...(targetUserId ? [{ userId: targetUserId }] : []),
        ...(decoded?._id && Types.ObjectId.isValid(decoded._id) ? [{ _id: new Types.ObjectId(decoded._id) }] : [])
      ],
      isDeleted: false
    }).select('-password -refreshToken');

    if (!user) {
      return sendResponse(res, 401, false, "Unauthorized - User not found");
    }

    // Optimize: Only update lastOnline every 5 minutes to reduce DB writes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (!user.lastOnline || user.lastOnline.getTime() < fiveMinutesAgo) {
      user.lastOnline = new Date();
      await user.save();
    }

    const originalUser = {
      role: (user.role ?? "user") as any,
      userId: user.userId,
      id: user.id,
      name: user.name as any,
      gender: user?.gender as any,
      coins: user?.coins || 0,
      diamonds: user?.diamonds || 0,
      userName: user?.userName as any,
      isUserName: user?.isUserName as any,
      image: user?.image as string,
      meethiId: user?.meethiId as string,
      employeeCode: user?.employeeCode as string,
      orgId: (user as any).orgId
    };

    req.user = originalUser;

    // Simulation Mode Check
    const simUserId = req.headers['x-simulation-user-id'] as string;
    if (simUserId && originalUser.role === 'owner') {
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        return sendResponse(res, 403, false, "Destructive actions are disabled during active permission simulation.");
      }

      const simUser = await User.findById(simUserId);
      if (simUser) {
        req.user = {
          role: (simUser.role ?? "user") as any,
          userId: simUser.userId,
          id: simUser.id,
          name: simUser.name as any,
          gender: simUser.gender as any,
          coins: simUser.coins || 0,
          diamonds: simUser.diamonds || 0,
          userName: simUser.userName as any,
          isUserName: simUser.isUserName as any,
          image: simUser.image as string,
          meethiId: simUser.meethiId as string,
          employeeCode: simUser.employeeCode as string,
          orgId: (simUser as any).orgId
        };
        (req as any).isSimulated = true;
      }
    }

    // Apply field-level security checks dynamically on response payload
    const { fieldSecurityFilter } = require("./fieldSecurity.middleware");
    await fieldSecurityFilter(req, res, next);
  } catch (error) {

    if (error instanceof TokenExpiredError) {
      return sendResponse(res, 401, false, "Unauthorized - Token has expired");
    }

    if (error instanceof JsonWebTokenError) {
      return sendResponse(res, 401, false, "Unauthorized - Invalid token");
    }

    return sendResponse(res, 500, false, "Internal Server Error");
  }
};

/**
 * Middleware: Check if authenticated user has permission for a specific module and action
 */
export const checkPermission = (moduleName: string, actionName: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendResponse(res, 401, false, "Unauthorized - User not authenticated");
    }

    const role = req.user.role || 'user';

    if (role === 'owner') {
      return next();
    }

    const { hasPermission } = require("../configs/rbacMatrix");
    const allowed = hasPermission(role, moduleName, actionName);

    if (!allowed) {
      return sendResponse(
        res,
        403,
        false,
        `403 Forbidden - Role '${role}' lacks '${actionName}' permission on module '${moduleName}'`
      );
    }

    next();
  };
};
