import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { Request as RequestModel, RequestStatus } from '../models/request.model';
import { AuditLog } from '../models/auditLog.model';
import { AuthRequest } from '../middlewares/authorize.middleware';
import sendResponse from '../utils/reponse';
import { generateSecureHash } from '../utils/passwordHelper';
import { generateToken, generateUniqueId } from '../utils/generator';
import { generateSpecialCode, generateStrongPassword, logActivity } from './emsController';
import mongoose from 'mongoose';
import { config } from "../configs/envConfig";
import { AuthType, Gender, UserRole } from "../constants/user";
import { Logger } from "../utils/logger";

// initialize super admin (seeding logic called on startup)
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
      authType: AuthType.PHONE,
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

// ─── GET: Admin List with aggregations ─────────────────────────────────────────
export const listAdmins = async (req: AuthRequest, res: Response) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const matchStage: any = { role: 'admin', isDeleted: false };
    if (status === 'active') matchStage.isBlocked = false;
    if (status === 'suspended') matchStage.isBlocked = true;
    if (search) {
      const q = new RegExp(String(search), 'i');
      matchStage.$or = [{ name: q }, { email: q }, { phoneNumber: q }];
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [admins, total] = await Promise.all([
      User.find(matchStage)
        .select('userId name email phoneNumber image role isBlocked isActive isOnline lastOnline coins diamonds createdAt country specialCode agencyId createdBy')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(matchStage),
    ]);

    // Enhance each admin with counts & recruited lists
    const enrichedAdmins = await Promise.all(
      admins.map(async (admin) => {
        const adminObjId = admin._id;

        const [activeAgenciesCount, newAgenciesCount, activeHostsCount, newHostsCount, recruitedAgencies] = await Promise.all([
          User.countDocuments({ role: 'agency', adminId: adminObjId, isBlocked: false, isDeleted: false }),
          User.countDocuments({ role: 'agency', adminId: adminObjId, isDeleted: false, createdAt: { $gte: thirtyDaysAgo } }),
          User.countDocuments({ role: 'host', adminId: adminObjId, isBlocked: false, isDeleted: false }),
          User.countDocuments({ role: 'host', adminId: adminObjId, isDeleted: false, createdAt: { $gte: thirtyDaysAgo } }),
          User.find({ role: 'agency', adminId: adminObjId, isDeleted: false })
            .select('userId name email phoneNumber specialCode referralCode isBlocked createdAt')
            .lean(),
        ]);

        return {
          ...admin,
          activeAgenciesCount,
          newAgenciesCount,
          activeHostsCount,
          newHostsCount,
          recruitedAgencies,
        };
      })
    );

    // Aggregated stats
    const stats = await User.aggregate([
      { $match: { role: 'admin', isDeleted: false } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$isBlocked', false] }, 1, 0] } },
          suspended: { $sum: { $cond: [{ $eq: ['$isBlocked', true] }, 1, 0] } },
          totalCoins: { $sum: '$coins' },
          totalDiamonds: { $sum: '$diamonds' },
        },
      },
    ]);

    return sendResponse(res, 200, true, 'Admins fetched', {
      admins: enrichedAdmins,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      stats: stats[0] || { total: 0, active: 0, suspended: 0, totalCoins: 0, totalDiamonds: 0 },
    });
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};

// ─── GET: Single Admin ─────────────────────────────────────────────────────────
export const getAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const admin = await User.findOne({ userId: id, role: 'admin' }).lean();
    if (!admin) return sendResponse(res, 404, false, 'Admin not found');
    return sendResponse(res, 200, true, 'Admin fetched', admin);
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};

// ─── PATCH: Toggle Block/Unblock ───────────────────────────────────────────────
export const toggleAdminBlock = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const admin = await User.findOne({ _id: id, role: 'admin' });
    if (!admin) return sendResponse(res, 404, false, 'Admin not found');

    admin.isBlocked = !admin.isBlocked;
    await admin.save();

    await logActivity(
      req.user!.id.toString(), req.user!.role,
      admin.isBlocked ? 'admin_suspended' : 'admin_activated',
      (admin as any)._id.toString(),
      `Admin ${admin.name} ${admin.isBlocked ? 'suspended' : 'activated'}`,
      req.ip || '127.0.0.1'
    );

    return sendResponse(res, 200, true, `Admin ${admin.isBlocked ? 'suspended' : 'activated'}`, { isBlocked: admin.isBlocked });
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};

// ─── DELETE: Soft-delete admin ─────────────────────────────────────────────────
export const deleteAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (req.user?.role !== 'owner') return sendResponse(res, 403, false, 'Owner only');

    const admin = await User.findOne({ _id: id, role: 'admin' });
    if (!admin) return sendResponse(res, 404, false, 'Admin not found');

    admin.isDeleted = true;
    await admin.save();

    await logActivity(req.user.id.toString(), req.user.role, 'admin_deleted', id, `Admin ${admin.name} deleted`, req.ip || '127.0.0.1');
    return sendResponse(res, 200, true, 'Admin deleted');
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};

// ─── POST: Reset Password ──────────────────────────────────────────────────────
export const resetAdminPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const admin = await User.findOne({ _id: id, role: 'admin' }).select('+password');
    if (!admin) return sendResponse(res, 404, false, 'Admin not found');

    const newPassword = generateStrongPassword();
    admin.password = await generateSecureHash(newPassword);
    await admin.save();

    return sendResponse(res, 200, true, 'Password reset', { newPassword });
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};