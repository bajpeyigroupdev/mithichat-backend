/**
 * Enterprise HierarchyScopeService (Production Architecture V3.0)
 * Single source of truth for ownership, visibility, dashboard statistics, reports, referrals, transfers, searches, and approvals.
 */
export class HierarchyScopeService {

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
