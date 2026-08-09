import { User } from '../models/user.model';

export interface OwnerReferralInfo {
  ownerIds: any[];
  ownerIdStrs: string[];
  ownerCodes: string[];
}

/**
 * Enterprise HierarchyScopeService (Production Architecture V3.0)
 * Single source of truth for ownership, visibility, dashboard statistics, reports, referrals, transfers, searches, and approvals.
 */
export class HierarchyScopeService {

  /**
   * Fetch all owner IDs and referral codes for dynamic owner-referral exclusion filtering
   */
  static async getOwnerReferralInfo(): Promise<OwnerReferralInfo> {
    try {
      const owners = await User.find({ role: 'owner', isDeleted: false })
        .select('_id referralCode employeeCode specialCode meethiId')
        .lean();

      const ownerIds = owners.map(o => o._id);
      const ownerIdStrs = owners.map(o => o._id.toString());
      const ownerCodes = owners.flatMap(o => [
        o.referralCode,
        o.employeeCode,
        o.specialCode,
        o.meethiId
      ]).filter(Boolean).map(c => String(c).trim());

      return { ownerIds, ownerIdStrs, ownerCodes };
    } catch (err) {
      return { ownerIds: [], ownerIdStrs: [], ownerCodes: [] };
    }
  }

  /**
   * Build query filter to exclude Owner-referred records for Operator role
   */
  static buildOwnerReferralExclusionFilter(
    userRole: string,
    modelType: 'request' | 'recruitment' | 'user',
    ownerInfo: OwnerReferralInfo
  ): Record<string, any> {
    if (userRole !== 'operator') return {};

    const { ownerIds, ownerIdStrs, ownerCodes } = ownerInfo;
    const ownerConditions: any[] = [];

    if (modelType === 'request') {
      ownerConditions.push({ createdByRole: 'owner' });
      ownerConditions.push({ referralRole: 'owner' });
      ownerConditions.push({ 'data.referredByRole': 'owner' });
      ownerConditions.push({ 'data.referrerRole': 'owner' });

      if (ownerIds.length > 0) {
        ownerConditions.push({ createdBy: { $in: [...ownerIds, ...ownerIdStrs] } });
        ownerConditions.push({ referralUserId: { $in: ownerIdStrs } });
      }

      if (ownerCodes.length > 0) {
        const codeRegexes = ownerCodes.map(c => new RegExp(`^${c.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));
        ownerConditions.push({ referralCode: { $in: codeRegexes } });
        ownerConditions.push({ 'data.referralCode': { $in: codeRegexes } });
        ownerConditions.push({ 'data.parentOwnerCode': { $in: codeRegexes } });
      }
    } else if (modelType === 'recruitment') {
      ownerConditions.push({ 'referrer.referrerRole': 'owner' });
      ownerConditions.push({ createdByRole: 'owner' });

      if (ownerIds.length > 0) {
        ownerConditions.push({ 'referrer.referrerId': { $in: [...ownerIds, ...ownerIdStrs] } });
      }

      if (ownerCodes.length > 0) {
        const codeRegexes = ownerCodes.map(c => new RegExp(`^${c.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));
        ownerConditions.push({ 'referrer.code': { $in: codeRegexes } });
        ownerConditions.push({ 'roleData.referralCode': { $in: codeRegexes } });
      }
    } else if (modelType === 'user') {
      ownerConditions.push({ createdByRole: 'owner' });
      ownerConditions.push({ referrerRole: 'owner' });
      ownerConditions.push({ parentRole: 'owner' });

      if (ownerIds.length > 0) {
        ownerConditions.push({ referredBy: { $in: ownerIds } });
        ownerConditions.push({ createdBy: { $in: ownerIds } });
        ownerConditions.push({ ownerId: { $in: ownerIds } });
        ownerConditions.push({ referrerId: { $in: ownerIdStrs } });
      }

      if (ownerCodes.length > 0) {
        const codeRegexes = ownerCodes.map(c => new RegExp(`^${c.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'));
        ownerConditions.push({ referrerCode: { $in: codeRegexes } });
      }
    }

    if (ownerConditions.length === 0) return {};
    return { $nor: ownerConditions };
  }

  /**
   * Check if a document is an owner referral
   */
  static isOwnerReferral(doc: any, modelType: 'request' | 'recruitment' | 'user', ownerInfo: OwnerReferralInfo): boolean {
    if (!doc) return false;
    const { ownerIdStrs, ownerCodes } = ownerInfo;
    const lowerCodes = ownerCodes.map(c => c.toLowerCase());

    if (modelType === 'request') {
      if (doc.createdByRole === 'owner' || doc.referralRole === 'owner') return true;
      if (doc.data?.referredByRole === 'owner' || doc.data?.referrerRole === 'owner') return true;
      if (doc.createdBy && ownerIdStrs.includes(doc.createdBy.toString())) return true;
      if (doc.referralUserId && ownerIdStrs.includes(doc.referralUserId.toString())) return true;
      if (doc.referralCode && lowerCodes.includes(doc.referralCode.toLowerCase())) return true;
      if (doc.data?.referralCode && lowerCodes.includes(doc.data.referralCode.toLowerCase())) return true;
      if (doc.data?.parentOwnerCode && lowerCodes.includes(doc.data.parentOwnerCode.toLowerCase())) return true;
    } else if (modelType === 'recruitment') {
      if (doc.referrer?.referrerRole === 'owner' || doc.createdByRole === 'owner') return true;
      if (doc.referrer?.referrerId && ownerIdStrs.includes(doc.referrer.referrerId.toString())) return true;
      if (doc.referrer?.code && lowerCodes.includes(doc.referrer.code.toLowerCase())) return true;
      if (doc.roleData?.referralCode && lowerCodes.includes(doc.roleData.referralCode.toLowerCase())) return true;
    } else if (modelType === 'user') {
      if (doc.createdByRole === 'owner' || doc.referrerRole === 'owner' || doc.parentRole === 'owner') return true;
      if (doc.referredBy && ownerIdStrs.includes(doc.referredBy.toString())) return true;
      if (doc.createdBy && ownerIdStrs.includes(doc.createdBy.toString())) return true;
      if (doc.ownerId && ownerIdStrs.includes(doc.ownerId.toString())) return true;
      if (doc.referrerId && ownerIdStrs.includes(doc.referrerId.toString())) return true;
      if (doc.referrerCode && lowerCodes.includes(doc.referrerCode.toLowerCase())) return true;
    }

    return false;
  }

  /**
   * Build User Query Scope Filter
   */
  static buildUserScope(user: { id: string; role: string }): Record<string, any> {
    const role = user.role;
    const userId = user.id.toString();

    // 1. Owner: Full platform visibility (Everything)
    if (role === 'owner') {
      return { isDeleted: false };
    }

    // 2. Operator: Global operational visibility (All lower roles across all networks)
    if (role === 'operator') {
      return { role: { $ne: 'owner' }, isDeleted: false };
    }

    // 3. Super Admin: Restricted strictly to own hierarchy branch
    if (role === 'superAdmin' || role === 'super-admin') {
      return {
        $or: [
          { superAdminId: userId },
          { referrerId: userId },
          { hierarchyPath: { $regex: userId } },
          { _id: userId }
        ],
        isDeleted: false
      };
    }

    // 4. Admin: Restricted strictly to own hierarchy branch
    if (role === 'admin') {
      return {
        $or: [
          { adminId: userId },
          { referrerId: userId },
          { hierarchyPath: { $regex: userId } },
          { _id: userId }
        ],
        isDeleted: false
      };
    }

    // 5. Agency: Restricted strictly to own network & hosts
    if (role === 'agency') {
      return {
        $or: [
          { agencyId: userId },
          { referrerId: userId },
          { hierarchyPath: { $regex: userId } },
          { _id: userId }
        ],
        isDeleted: false
      };
    }

    // 6. Host, Seller, CS: Own record only
    return { _id: userId, isDeleted: false };
  }

  /**
   * Build EMS Request Scope Filter
   */
  static buildRequestScope(user: { id: string; role: string }): Record<string, any> {
    const role = user.role;
    const userId = user.id.toString();

    if (role === 'owner') return {};
    if (role === 'operator') return { role: { $ne: 'owner' } };

    if (role === 'superAdmin' || role === 'super-admin') {
      return {
        $or: [
          { referralUserId: userId },
          { 'data.superAdminId': userId },
          { createdBy: userId }
        ]
      };
    }

    if (role === 'admin') {
      return {
        $or: [
          { referralUserId: userId },
          { 'data.adminId': userId },
          { createdBy: userId }
        ]
      };
    }

    if (role === 'agency') {
      return {
        $or: [
          { referralUserId: userId },
          { 'data.agencyId': userId },
          { createdBy: userId }
        ]
      };
    }

    return { createdBy: userId };
  }

  /**
   * Build Referral Network Scope Filter
   */
  static buildReferralScope(user: { id: string; role: string }): Record<string, any> {
    return this.buildUserScope(user);
  }

  /**
   * Build Audit Log Scope Filter
   */
  static buildAuditScope(user: { id: string; role: string }): Record<string, any> {
    const role = user.role;
    const userId = user.id.toString();

    if (role === 'owner' || role === 'operator') return {};

    return {
      $or: [
        { actorId: userId },
        { targetId: userId }
      ]
    };
  }

  /**
   * Build Dashboard Counter Scope Filter
   */
  static buildDashboardScope(user: { id: string; role: string }): Record<string, any> {
    return this.buildUserScope(user);
  }

  /**
   * Build Wallet Scope Filter
   */
  static buildWalletScope(user: { id: string; role: string }): Record<string, any> {
    return this.buildUserScope(user);
  }

  /**
   * Build Withdrawal Scope Filter
   */
  static buildWithdrawalScope(user: { id: string; role: string }): Record<string, any> {
    return this.buildUserScope(user);
  }

  /**
   * Build Analytics Scope Filter
   */
  static buildAnalyticsScope(user: { id: string; role: string }): Record<string, any> {
    return this.buildUserScope(user);
  }

  /**
   * Build Report Scope Filter
   */
  static buildReportScope(user: { id: string; role: string }): Record<string, any> {
    return this.buildUserScope(user);
  }

  /**
   * Build Transfer Scope Filter
   */
  static buildTransferScope(user: { id: string; role: string }): Record<string, any> {
    return this.buildUserScope(user);
  }

  /**
   * Build Global Search Scope Filter
   */
  static buildSearchScope(user: { id: string; role: string }, searchKeyword: string): Record<string, any> {
    const scopeFilter = this.buildUserScope(user);
    if (!searchKeyword || !searchKeyword.trim()) return scopeFilter;

    const regex = new RegExp(searchKeyword.trim(), 'i');

    return {
      $and: [
        scopeFilter,
        {
          $or: [
            { name: regex },
            { email: regex },
            { phoneNumber: regex },
            { specialCode: regex },
            { employeeCode: regex },
            { meethiId: regex },
            { referralCode: regex }
          ]
        }
      ]
    };
  }
}

export const buildHierarchyQueryFilter = HierarchyScopeService.buildUserScope.bind(HierarchyScopeService);
