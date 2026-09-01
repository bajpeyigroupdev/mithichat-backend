import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import Host from '../models/host.model';
import { CoinsTransaction } from '../models/spentCoinModel';
import { RechargeHistory } from '../models/RechargeHistory';
import { Report } from '../models/report.model';
import { Referral } from '../models/referral.model';
import { DeviceLimit } from '../models/deviceLimit.model';
import { getCachedSettings } from './settingsController';
import sendResponse from '../utils/reponse';
import AppError from '../utils/errorHandler';
import { Logger } from '../utils/logger';
import dayjs from 'dayjs';
import { CallStatus, TransactionType } from '../constants/user';
import { PANEL_ACCOUNT_ROLES } from '../utils/accountScope';
import { HierarchyScopeService } from '../utils/hierarchyScope';



// Helper to get host filter based on role
const getHostFilter = async (req: Request): Promise<any> => {
    const actor = (req as any).user;
    const { role } = actor || {};

    if (!role || ['superAdmin', 'owner', 'operator', 'customerSupport'].includes(role)) {
        return {};
    }

    if (['superAdmin', 'super-admin', 'admin', 'agency'].includes(role)) {
        const myHosts = await User.find({
            $and: [
                HierarchyScopeService.buildDashboardScope({ id: String(actor.id), role }),
                { role: 'host' },
            ],
        }).select('_id');
        return { hostId: { $in: myHosts.map((host) => host._id) } };
    }

    return {};
};

// Helper to build default 7-day date series map
const build7DayMap = (daysCount: number) => {
    const map: { [date: string]: number } = {};
    for (let i = daysCount - 1; i >= 0; i--) {
        const dateStr = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
        map[dateStr] = 0;
    }
    return map;
};

// Get dashboard statistics
export const getDashboardStats = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const hostFilter = await getHostFilter(req);
        const actor = (req as any).user;
        const userScope = actor
            ? HierarchyScopeService.buildDashboardScope({ id: String(actor.id), role: actor.role })
            : { _id: null };
        const requestScope = actor
            ? HierarchyScopeService.buildRequestScope({ id: String(actor.id), role: actor.role })
            : { _id: null };
        const scopedUserFilter = (extra: Record<string, any> = {}) => ({
            $and: [userScope, extra],
        });
        const scopedRequestFilter = (extra: Record<string, any> = {}) => ({
            $and: [requestScope, extra],
        });

        // Phase 5 & 6 Enterprise Real-Time Aggregations
        const { Request: RequestModel } = await import('../models/request.model');

        // Request Statistics (EMS)
        const [pendingRequests, approvedRequests, rejectedRequests] = await Promise.all([
            RequestModel.countDocuments(scopedRequestFilter({ status: 'pending' })).catch(() => 0),
            RequestModel.countDocuments(scopedRequestFilter({ status: 'approved' })).catch(() => 0),
            RequestModel.countDocuments(scopedRequestFilter({ status: 'rejected' })).catch(() => 0),
        ]);

        // Role Counts (MongoDB Users)
        const [
            totalSuperAdmins,
            totalAdmins,
            totalAgencies,
            totalOperators,
            totalHostsCount,
            approvedHostsCount,
            totalSellers,
            totalCustomerSupport
        ] = await Promise.all([
            User.countDocuments(scopedUserFilter({ role: 'superAdmin', isDeleted: false })),
            User.countDocuments(scopedUserFilter({ role: 'admin', isDeleted: false })),
            User.countDocuments(scopedUserFilter({ role: 'agency', isDeleted: false })),
            User.countDocuments(scopedUserFilter({ role: 'operator', isDeleted: false })),
            User.countDocuments(scopedUserFilter({ role: 'host', isDeleted: false })),
            User.countDocuments(scopedUserFilter({ role: 'host', isDeleted: false, isApproved: true })),
            User.countDocuments(scopedUserFilter({ role: 'coinSeller', isDeleted: false })),
            User.countDocuments(scopedUserFilter({ role: 'customerSupport', isDeleted: false })),
        ]);

        // Registration Timeframes
        const todayStart = dayjs().startOf('day').toDate();
        const weekStart = dayjs().subtract(7, 'day').startOf('day').toDate();
        const monthStart = dayjs().subtract(30, 'day').startOf('day').toDate();

        const [
            todaysRegistrations,
            weeklyRegistrations,
            monthlyRegistrations,
            todayNewHosts,
            weeklyNewHosts,
            monthlyNewHosts,
        ] = await Promise.all([
            User.countDocuments(scopedUserFilter({ createdAt: { $gte: todayStart } })),
            User.countDocuments(scopedUserFilter({ createdAt: { $gte: weekStart } })),
            User.countDocuments(scopedUserFilter({ createdAt: { $gte: monthStart } })),
            User.countDocuments(scopedUserFilter({ role: 'host', createdAt: { $gte: todayStart } })),
            User.countDocuments(scopedUserFilter({ role: 'host', createdAt: { $gte: weekStart } })),
            User.countDocuments(scopedUserFilter({ role: 'host', createdAt: { $gte: monthStart } })),
        ]);

        // User Status Breakdown & Unique Active Users (DAU & MAU)
        const past24h = dayjs().subtract(24, 'hour').toDate();
        const past30d = dayjs().subtract(30, 'day').toDate();

        const [activeUsersCount, inactiveUsersCount, blockedUsersCount, deletedUsersCount, dauCount, mauCount] = await Promise.all([
            User.countDocuments(scopedUserFilter({ isDeleted: false, isBlocked: false, isActive: true })),
            User.countDocuments(scopedUserFilter({ isDeleted: false, isActive: false })),
            User.countDocuments(scopedUserFilter({ isDeleted: false, isBlocked: true })),
            User.countDocuments(scopedUserFilter({ isDeleted: true })),
            User.countDocuments(scopedUserFilter({
                isDeleted: false,
                role: { $nin: PANEL_ACCOUNT_ROLES },
                $or: [
                    { isOnline: true },
                    { lastOnline: { $gte: past24h } },
                    { updatedAt: { $gte: past24h } },
                    { isActive: true }
                ]
            })).catch(() => 0),
            User.countDocuments(scopedUserFilter({
                isDeleted: false,
                role: { $nin: PANEL_ACCOUNT_ROLES },
                $or: [
                    { isOnline: true },
                    { lastOnline: { $gte: past30d } },
                    { updatedAt: { $gte: past30d } },
                    { isActive: true }
                ]
            })).catch(() => 0),
        ]);

        // Total users (Global count of app users, excluding panel staff)
        const totalUsers = await User.countDocuments(scopedUserFilter({
            isDeleted: false,
            role: { $nin: PANEL_ACCOUNT_ROLES },
        }));

        // Pending Reports Count
        const reportsPending = await Report.countDocuments({ status: 'pending' }).catch(() => 0);

        // Active Calls Count
        const activeCalls = await CoinsTransaction.countDocuments({
            ...hostFilter,
            status: { $in: [CallStatus.ACCEPTED, CallStatus.CONNECTED, CallStatus.CONNECTING] },
            type: TransactionType.VOICE_CALL,
        }).catch(() => 0);

        // Base match for transactions + host filter
        const txMatch = { ...hostFilter };

        // Unique Callers & Unique Active Hosts Today
        const [uniqueCallersTodayList, uniqueHostsTodayList] = await Promise.all([
            CoinsTransaction.distinct('userId', {
                ...txMatch,
                createdAt: { $gte: todayStart }
            }).catch(() => []),
            CoinsTransaction.distinct('hostId', {
                ...txMatch,
                createdAt: { $gte: todayStart }
            }).catch(() => [])
        ]);

        const uniqueCallersToday = uniqueCallersTodayList.length;
        const uniqueHostsActiveToday = uniqueHostsTodayList.length;

        // Call stats for today
        const callsToday = await CoinsTransaction.countDocuments({
            ...txMatch,
            type: TransactionType.VOICE_CALL,
            createdAt: { $gte: todayStart },
        });

        const callAggregation = await CoinsTransaction.aggregate([
            {
                $match: {
                    ...txMatch,
                    type: TransactionType.VOICE_CALL,
                    status: CallStatus.ENDED,
                    createdAt: { $gte: todayStart },
                },
            },
            {
                $group: {
                    _id: null,
                    totalSeconds: { $sum: '$duration' },
                    totalCoins: { $sum: '$coinsSpent' },
                    totalHostEarnings: { $sum: '$hostEarning' },
                },
            },
        ]);

        const minutesToday = Math.round((callAggregation[0]?.totalSeconds || 0) / 60);
        const coinsSpentToday = callAggregation[0]?.totalCoins || 0;
        const hostCoinsToday = callAggregation[0]?.totalHostEarnings || 0;
        const coinPrice = 0.10;
        // Referral & Device Limit Stats
        const settings = await getCachedSettings();
        const [totalReferralsCount, aggregateReward, totalDeviceOverrides] = await Promise.all([
            Referral.countDocuments().catch(() => 0),
            Referral.aggregate([
                { $group: { _id: null, totalDiamonds: { $sum: '$referrerReward' } } }
            ]).catch(() => []),
            DeviceLimit.countDocuments().catch(() => 0),
        ]);

        const totalDiamondsGranted = (aggregateReward && aggregateReward[0]?.totalDiamonds) || 0;
        const revenueToday = coinsSpentToday * coinPrice;
        const hostEarningsToday = hostCoinsToday * coinPrice;

        const stats = {
            totalUsers,
            activeUsers: Math.max(activeUsersCount, dauCount),
            dau: dauCount,
            mau: mauCount,
            uniqueCallersToday,
            uniqueHostsActiveToday,
            totalHosts: totalHostsCount,
            activeHosts: approvedHostsCount,
            activeCalls,
            reportsPending,
            referrals: {
                totalReferrals: totalReferralsCount,
                totalDiamondsGranted,
            },
            devices: {
                totalOverrides: totalDeviceOverrides,
                defaultMaxAccounts: settings?.defaultMaxAccountsPerDevice || 1,
            },
            requests: {
                pending: pendingRequests,
                approved: approvedRequests,
                rejected: rejectedRequests,
                total: pendingRequests + approvedRequests + rejectedRequests,
            },
            roles: {
                superAdmin: totalSuperAdmins,
                admin: totalAdmins,
                agency: totalAgencies,
                operator: totalOperators,
                host: totalHostsCount,
                seller: totalSellers,
                customerSupport: totalCustomerSupport,
            },
            registrations: {
                today: todaysRegistrations,
                weekly: weeklyRegistrations,
                monthly: monthlyRegistrations,
            },
            hostRegistrations: {
                today: todayNewHosts,
                weekly: weeklyNewHosts,
                monthly: monthlyNewHosts,
            },
            statuses: {
                active: activeUsersCount,
                inactive: inactiveUsersCount,
                blocked: blockedUsersCount,
                deleted: deletedUsersCount,
            },
            stats: {
                callsToday,
                minutesToday,
                coinsSpentToday,
                uniqueCallersToday,
                uniqueHostsActiveToday,
                hostEarningsToday: parseFloat(hostEarningsToday.toFixed(2)),
                revenueToday: parseFloat(revenueToday.toFixed(2)),
            },
        };

        return sendResponse(res, 200, true, 'Real-time Enterprise dashboard stats fetched successfully', stats);
    } catch (error) {
        await Logger('getDashboardStats', error);
        next(error);
    }
};

// Get revenue chart data
export const getRevenueChart = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const hostFilter = await getHostFilter(req);
        const { days = 7 } = req.query;
        const daysCount = parseInt(days as string) || 7;
        const startDate = dayjs().subtract(daysCount - 1, 'day').startOf('day').toDate();

        const dateMap = build7DayMap(daysCount);

        let revenueData = await RechargeHistory.aggregate([
            { $match: { date: { $gte: startDate } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, revenue: { $sum: '$amount' } } },
            { $sort: { _id: 1 } },
        ]);

        if (!revenueData || revenueData.length === 0) {
            revenueData = await CoinsTransaction.aggregate([
                { $match: { ...hostFilter, createdAt: { $gte: startDate }, type: TransactionType.VOICE_CALL } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$coinsSpent' } } },
                { $sort: { _id: 1 } },
            ]);
            revenueData.forEach(item => {
                if (item._id && dateMap[item._id] !== undefined) {
                    dateMap[item._id] = (item.revenue || 0) * 0.10;
                }
            });
        } else {
            revenueData.forEach(item => {
                if (item._id && dateMap[item._id] !== undefined) {
                    dateMap[item._id] = item.revenue || 0;
                }
            });
        }

        const formattedData = Object.keys(dateMap).map(date => ({
            date,
            revenue: parseFloat(Number(dateMap[date]).toFixed(2)),
        }));

        return sendResponse(res, 200, true, 'Revenue chart data fetched successfully', formattedData);
    } catch (error) {
        await Logger('getRevenueChart', error);
        next(error);
    }
};

// Get host earnings chart data
export const getEarningsChart = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const hostFilter = await getHostFilter(req);
        const { days = 7 } = req.query;
        const daysCount = parseInt(days as string) || 7;
        const startDate = dayjs().subtract(daysCount - 1, 'day').startOf('day').toDate();

        const dateMap = build7DayMap(daysCount);

        const earningsData = await CoinsTransaction.aggregate([
            {
                $match: {
                    ...hostFilter,
                    type: TransactionType.VOICE_CALL,
                    status: CallStatus.ENDED,
                    createdAt: { $gte: startDate },
                },
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    earnings: { $sum: '$hostEarning' },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        earningsData.forEach(item => {
            if (item._id && dateMap[item._id] !== undefined) {
                dateMap[item._id] = (item.earnings || 0) * 0.10;
            }
        });

        const formattedData = Object.keys(dateMap).map(date => ({
            date,
            earnings: parseFloat(Number(dateMap[date]).toFixed(2)),
        }));

        return sendResponse(res, 200, true, 'Earnings chart data fetched successfully', formattedData);
    } catch (error) {
        await Logger('getEarningsChart', error);
        next(error);
    }
};

// Get call trends
export const getCallTrends = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const hostFilter = await getHostFilter(req);
        const { days = 7 } = req.query;
        const daysCount = parseInt(days as string) || 7;
        const startDate = dayjs().subtract(daysCount - 1, 'day').startOf('day').toDate();

        const callsMap: { [date: string]: number } = {};
        const durationMap: { [date: string]: number } = {};

        for (let i = daysCount - 1; i >= 0; i--) {
            const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
            callsMap[d] = 0;
            durationMap[d] = 0;
        }

        const callTrends = await CoinsTransaction.aggregate([
            {
                $match: {
                    ...hostFilter,
                    type: TransactionType.VOICE_CALL,
                    createdAt: { $gte: startDate },
                },
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    calls: { $sum: 1 },
                    duration: { $sum: '$duration' },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        callTrends.forEach(item => {
            if (item._id && callsMap[item._id] !== undefined) {
                callsMap[item._id] = item.calls || 0;
                durationMap[item._id] = Math.round((item.duration || 0) / 60);
            }
        });

        const formattedData = Object.keys(callsMap).map(date => ({
            date,
            calls: callsMap[date],
            duration: durationMap[date],
        }));

        return sendResponse(res, 200, true, 'Call trends fetched successfully', formattedData);
    } catch (error) {
        await Logger('getCallTrends', error);
        next(error);
    }
};

// Get coin distribution
export const getCoinDistribution = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const hostFilter = await getHostFilter(req);
        const distribution = await CoinsTransaction.aggregate([
            {
                $match: {
                    ...hostFilter,
                    status: CallStatus.ENDED,
                },
            },
            {
                $group: {
                    _id: '$type',
                    total: { $sum: '$coinsSpent' },
                    count: { $sum: 1 },
                },
            },
        ]);

        let formattedData = distribution.map((item) => ({
            type: item._id || 'VOICE_CALL',
            total: item.total || 0,
            count: item.count || 0,
        }));

        if (formattedData.length === 0) {
            formattedData = [
                { type: 'VOICE_CALL', total: 0, count: 0 },
                { type: 'VIDEO_CALL', total: 0, count: 0 },
            ];
        }

        return sendResponse(res, 200, true, 'Coin distribution fetched successfully', formattedData);
    } catch (error) {
        await Logger('getCoinDistribution', error);
        next(error);
    }
};
