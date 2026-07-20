import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { AuthRequest } from '../middlewares/authorize.middleware';
import sendResponse from '../utils/reponse';
import { generateSecureHash } from '../utils/passwordHelper';
import { generateStrongPassword, logActivity } from './emsController';

// ─── GET: Operator List with aggregations ──────────────────────────────────────
export const listOperators = async (req: AuthRequest, res: Response) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const matchStage: any = { role: 'operator', isDeleted: false };
    if (status === 'active') matchStage.isBlocked = false;
    if (status === 'suspended') matchStage.isBlocked = true;
    if (search) {
      const q = new RegExp(String(search), 'i');
      matchStage.$or = [{ name: q }, { email: q }, { phoneNumber: q }];
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [operators, total] = await Promise.all([
      User.find(matchStage)
        .select('userId name email phoneNumber image role isBlocked isActive isOnline lastOnline coins diamonds createdAt country specialCode agencyId createdBy')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(matchStage),
    ]);

    // Enhance each operator with counts & recruited lists
    const enrichedOperators = await Promise.all(
      operators.map(async (opr) => {
        const oprObjId = opr._id;

        const [
          activeSuperAdminsCount, newSuperAdminsCount,
          activeAdminsCount, newAdminsCount,
          activeAgenciesCount, newAgenciesCount,
          activeHostsCount, newHostsCount,
          recruitedSuperAdmins, recruitedAdmins, recruitedAgencies
        ] = await Promise.all([
          User.countDocuments({ role: 'superAdmin', operatorId: oprObjId, isBlocked: false, isDeleted: false }),
          User.countDocuments({ role: 'superAdmin', operatorId: oprObjId, isDeleted: false, createdAt: { $gte: thirtyDaysAgo } }),
          User.countDocuments({ role: 'admin', operatorId: oprObjId, isBlocked: false, isDeleted: false }),
          User.countDocuments({ role: 'admin', operatorId: oprObjId, isDeleted: false, createdAt: { $gte: thirtyDaysAgo } }),
          User.countDocuments({ role: 'agency', operatorId: oprObjId, isBlocked: false, isDeleted: false }),
          User.countDocuments({ role: 'agency', operatorId: oprObjId, isDeleted: false, createdAt: { $gte: thirtyDaysAgo } }),
          User.countDocuments({ role: 'host', operatorId: oprObjId, isBlocked: false, isDeleted: false }),
          User.countDocuments({ role: 'host', operatorId: oprObjId, isDeleted: false, createdAt: { $gte: thirtyDaysAgo } }),
          User.find({ role: 'superAdmin', operatorId: oprObjId, isDeleted: false })
            .select('userId name email phoneNumber specialCode referralCode isBlocked createdAt')
            .lean(),
          User.find({ role: 'admin', operatorId: oprObjId, isDeleted: false })
            .select('userId name email phoneNumber specialCode referralCode isBlocked createdAt')
            .lean(),
          User.find({ role: 'agency', operatorId: oprObjId, isDeleted: false })
            .select('userId name email phoneNumber specialCode referralCode isBlocked createdAt')
            .lean(),
        ]);

        return {
          ...opr,
          activeSuperAdminsCount,
          newSuperAdminsCount,
          activeAdminsCount,
          newAdminsCount,
          activeAgenciesCount,
          newAgenciesCount,
          activeHostsCount,
          newHostsCount,
          recruitedSuperAdmins,
          recruitedAdmins,
          recruitedAgencies,
        };
      })
    );

    // Aggregated stats
    const stats = await User.aggregate([
      { $match: { role: 'operator', isDeleted: false } },
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

    return sendResponse(res, 200, true, 'Operators fetched', {
      operators: enrichedOperators,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      stats: stats[0] || { total: 0, active: 0, suspended: 0, totalCoins: 0, totalDiamonds: 0 },
    });
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};

// ─── GET: Single Operator ──────────────────────────────────────────────────────
export const getOperator = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const operator = await User.findOne({ userId: id, role: 'operator' }).lean();
    if (!operator) return sendResponse(res, 404, false, 'Operator not found');
    return sendResponse(res, 200, true, 'Operator fetched', operator);
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};

// ─── PATCH: Toggle Block/Unblock Operator ───────────────────────────────────────
export const toggleOperatorBlock = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const operator = await User.findOne({ _id: id, role: 'operator' });
    if (!operator) return sendResponse(res, 404, false, 'Operator not found');

    operator.isBlocked = !operator.isBlocked;
    await operator.save();

    await logActivity(
      req.user!.id.toString(), req.user!.role,
      operator.isBlocked ? 'operator_suspended' : 'operator_activated',
      (operator as any)._id.toString(),
      `Operator ${operator.name} ${operator.isBlocked ? 'suspended' : 'activated'}`,
      req.ip || '127.0.0.1'
    );

    return sendResponse(res, 200, true, `Operator ${operator.isBlocked ? 'suspended' : 'activated'}`, { isBlocked: operator.isBlocked });
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};

// ─── DELETE: Soft-delete Operator ──────────────────────────────────────────────
export const deleteOperator = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (req.user?.role !== 'owner') return sendResponse(res, 403, false, 'Owner only');

    const operator = await User.findOne({ _id: id, role: 'operator' });
    if (!operator) return sendResponse(res, 404, false, 'Operator not found');

    operator.isDeleted = true;
    await operator.save();

    await logActivity(req.user.id.toString(), req.user.role, 'operator_deleted', id, `Operator ${operator.name} deleted`, req.ip || '127.0.0.1');
    return sendResponse(res, 200, true, 'Operator deleted');
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};

// ─── POST: Reset Operator Password ─────────────────────────────────────────────
export const resetOperatorPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const operator = await User.findOne({ _id: id, role: 'operator' }).select('+password');
    if (!operator) return sendResponse(res, 404, false, 'Operator not found');

    const newPassword = generateStrongPassword();
    operator.password = await generateSecureHash(newPassword);
    await operator.save();

    return sendResponse(res, 200, true, 'Password reset', { newPassword });
  } catch (err: any) {
    return sendResponse(res, 500, false, err.message);
  }
};
