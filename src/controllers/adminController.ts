import dotenv from "dotenv";
import { Response, NextFunction } from "express";
import { User } from "../models/user.model"; // Adjust the path as per your project
import AppError from "../utils/errorHandler";
import sendResponse from "../utils/reponse";
import { generateSecureHash } from "../utils/passwordHelper";
import { generateUniqueId } from "../utils/generator";
import { config } from "../configs/envConfig";
import { Logger } from "../utils/logger";
import { AuthType, Gender, UserRole } from "../constants/user";
import { AuthRequest } from "../middlewares/authorize.middleware";

dotenv.config(); // Load environment variables

// initialize super admin
// working fine
export const initializeSuperAdmin = async (): Promise<void> => {
  try {
    const {
      SUPER_ADMIN_EMAIL,
      SUPER_ADMIN_PASSWORD,
      SUPER_ADMIN_PHONE,
      SUPER_ADMIN_ROLE,
    } = config;

    if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
      throw new Error("Super admin credentials missing in env");
    }

    const existingSuperAdmin = await User.findOne({
      role: UserRole.SUPER_ADMIN,
      isDeleted: false,
    });

    if (existingSuperAdmin) {
      console.log("✅ Super Admin already exists");
      return;
    }

    const hashedPassword = await generateSecureHash(SUPER_ADMIN_PASSWORD);
    const userId = await generateUniqueId();

    await User.create({
      name: "Super Admin",
      userId,
      email: SUPER_ADMIN_EMAIL,
      phoneNumber: SUPER_ADMIN_PHONE || undefined,
      password: hashedPassword,

      role: SUPER_ADMIN_ROLE || UserRole.SUPER_ADMIN,
      authType: AuthType.GOOGLE,

      gender: Gender.MALE,

      emailVerified: true,
      phoneVerified: true,

      isActive: true,
      isOnline: false,
      isBlocked: false,

      device: {
        createdDeviceId: "SYSTEM_INIT",
        currentDeviceId: "SYSTEM_INIT",
        loggedInDeviceIds: ["SYSTEM_INIT"],
      },

      createdBy: null,
    });

    console.log("🚀 Super Admin created successfully");
  } catch (error) {
    await Logger("initializeSuperAdmin", error);
    throw error;
  }
};