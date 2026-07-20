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

// ─── GET: Super Admin List with aggregations ──────────────────────────────────
export const listSuperAdmins = async (req: AuthRequest, res: Response) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const matchStage: any = { role: 'superAdmin', isDeleted: false };
    if (status === 'active') matchStage.isBlocked = false;
    if (status === 'suspended') matchStage.isBlocked = true;
    if (search) {
      const q = new RegExp(String(search), 'i');
      matchStage.$or = [{ name: q }, { email: q }, { phoneNumber: q }];
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [superAdmins, total] = await Promise.all([
      User.find(matchStage)
        .select('userId name email phoneNumber image role isBlocked isActive isOnline lastOnline coins diamonds createdAt country specialCode agencyId createdBy')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(matchStage),
    ]);

    // Enhance each super admin with counts & recruited lists
    const enrichedSuperAdmins = await Promise.all(
      superAdmins.map(async (sa) => {
        const saObjId = sa._id;

        const [
          activeAdminsCount, newAdminsCount,
          activeAgenciesCount, newAgenciesCount,
          activeHostsCount, newHostsCount,
          recruitedAdmins, recruitedAgencies
        ] = await Promise.all([
          User.countDocuments({ role: 'admin', superAdminId: saObjId, isBlocked: false, isDeleted: false }),
          User.countDocuments({ role: 'admin', superAdminId: saObjId, isDeleted: false, createdAt: { $gte: thirtyDaysAgo } }),
          User.countDocuments({ role: 'agency', superAdminId: saObjId, isBlocked: false, isDeleted: false }),
          User.countDocuments({ role: 'agency', superAdminId: saObjId, isDeleted: false, createdAt: { $gte: thirtyDaysAgo } }),
          User.countDocuments({ role: 'host', superAdminId: saObjId, isBlocked: false, isDeleted: false }),
          User.countDocuments({ role: 'host', superAdminId: saObjId, isDeleted: false, createdAt: { $gte: thirtyDaysAgo } }),
          User.find({ role: 'admin', superAdminId: saObjId, isDeleted: false })
            .select('userId name email phoneNumber specialCode referralCode isBlocked createdAt')
            .lean(),
          User.find({ role: 'agency', superAdminId: saObjId, isDeleted: false })
            .select('userId name email phoneNumber specialCode referralCode isBlocked createdAt')
            .lean(),
        ]);

        return {
          ...sa,
          activeAdminsCount,
          newAdminsCount,
          activeAgenciesCount,
          newAgenciesCount,
          activeHostsCount,
          newHostsCount,
          recruitedAdmins,
          recruitedAgencies,
        };
      })
    );

    // Aggregated stats
    const stats = await User.aggregate([
      { $match: { role: 'superAdmin', isDeleted: false } },
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

    return sendResponse(res, 200, true, 'Super Admins fetched', {
      superAdmins: enrichedSuperAdmins,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      stats: stats[0] || { total: 0, active: 0, suspended: 0, totalCoins: 0, totalDiamonds: 0 },
    });
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};

// ─── GET: Single Super Admin ──────────────────────────────────────────────────
export const getSuperAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const superAdmin = await User.findOne({ userId: id, role: 'superAdmin' }).lean();
    if (!superAdmin) return sendResponse(res, 404, false, 'Super Admin not found');
    return sendResponse(res, 200, true, 'Super Admin fetched', superAdmin);
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};

// ─── PATCH: Toggle Block/Unblock ───────────────────────────────────────────────
export const toggleSuperAdminBlock = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const superAdmin = await User.findOne({ _id: id, role: 'superAdmin' });
    if (!superAdmin) return sendResponse(res, 404, false, 'Super Admin not found');

    superAdmin.isBlocked = !superAdmin.isBlocked;
    await superAdmin.save();

    await logActivity(
      req.user!.id.toString(), req.user!.role,
      superAdmin.isBlocked ? 'superadmin_suspended' : 'superadmin_activated',
      (superAdmin as any)._id.toString(),
      `Super Admin ${superAdmin.name} ${superAdmin.isBlocked ? 'suspended' : 'activated'}`,
      req.ip || '127.0.0.1'
    );

    return sendResponse(res, 200, true, `Super Admin ${superAdmin.isBlocked ? 'suspended' : 'activated'}`, { isBlocked: superAdmin.isBlocked });
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};

// ─── DELETE: Soft-delete Super Admin ──────────────────────────────────────────
export const deleteSuperAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (req.user?.role !== 'owner') return sendResponse(res, 403, false, 'Owner only');

    const superAdmin = await User.findOne({ _id: id, role: 'superAdmin' });
    if (!superAdmin) return sendResponse(res, 404, false, 'Super Admin not found');

    superAdmin.isDeleted = true;
    await superAdmin.save();

    await logActivity(req.user.id.toString(), req.user.role, 'superadmin_deleted', id, `Super Admin ${superAdmin.name} deleted`, req.ip || '127.0.0.1');
    return sendResponse(res, 200, true, 'Super Admin deleted');
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};

// ─── POST: Reset Password ──────────────────────────────────────────────────────
export const resetSuperAdminPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const superAdmin = await User.findOne({ _id: id, role: 'superAdmin' }).select('+password');
    if (!superAdmin) return sendResponse(res, 404, false, 'Super Admin not found');

    const newPassword = generateStrongPassword();
    superAdmin.password = await generateSecureHash(newPassword);
    await superAdmin.save();

    return sendResponse(res, 200, true, 'Password reset', { newPassword });
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};
