import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import jwt, { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { User } from "../models/user.model";
import sendResponse from "../utils/reponse";
import { config } from "../configs/envConfig";




export interface AuthRequest extends Request {
  user?: {
    role: "owner" | "superAdmin" | "admin" | "coinSeller" | "host" | "user";
    userId: number;
    id: Types.ObjectId;
    name: string;
    gender: string;
    coins: number;
    diamonds: number;
    userName: string;
    isUserName: boolean;
    image: string;
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
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET as string) as { userId: number };
    if (!decoded.userId) {
      return sendResponse(res, 401, false, "Unauthorized - Invalid token payload");
    }

    // Explicitly exclude sensitive fields
    const user = await User.findOne({ userId: decoded.userId, isDeleted: false })
      .select('-password -refreshToken');

    if (!user) {
      return sendResponse(res, 401, false, "Unauthorized - User not found");
    }

    // Optimize: Only update lastOnline every 5 minutes to reduce DB writes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (!user.lastOnline || user.lastOnline.getTime() < fiveMinutesAgo) {
      user.lastOnline = new Date();
      await user.save();
    }

    req.user = { role: user.role ?? "user", userId: user.userId, id: user.id, name: user.name as any, gender: user?.gender as any, coins: user?.coins || 0, diamonds: user?.diamonds || 0, userName: user?.userName as any, isUserName: user?.isUserName as any, image: user?.image as string };
    next();
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
