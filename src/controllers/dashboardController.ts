import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import Host from '../models/host.model';
import { CoinsTransaction } from '../models/spentCoinModel';
import { RechargeHistory } from '../models/RechargeHistory';
import { Report } from '../models/report.model';
import sendResponse from '../utils/reponse';
import AppError from '../utils/errorHandler';
import { Logger } from '../utils/logger';
import dayjs from 'dayjs';
import { CallStatus, TransactionType } from '../constants/user';
import { PANEL_ACCOUNT_ROLES } from '../utils/accountScope';


// Helper to get host filter based on role
const getHostFilter = async (req: Request): Promise<any> => {
    const { role, userId } = (req as any).user || {};

    if (role === 'superAdmin') return {};

    if (role === 'admin') {
        const adminUser = await User.findById(userId);
        if (!adminUser?.meethiId) return { hostId: null }; // No ID, no data

        // Find all hosts with this meethiId
        const myHosts = await User.find({ meethiId: adminUser.meethiId, role: 'host' }).select('_id');
        const hostIds = myHosts.map(h => h._id);

        return { hostId: { $in: hostIds } };
    }

    return { hostId: null }; // Default block
};

// Get dashboard statistics
export const getDashboardStats = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const hostFilter = await getHostFilter(req);

        // Phase 5 & 6 Enterprise Real-Time Aggregations
        const { Request: RequestModel } = await import('../models/request.model');

        // Request Statistics (EMS)
        const [pendingRequests, approvedRequests, rejectedRequests] = await Promise.all([
            RequestModel.countDocuments({ status: 'pending' }),
            RequestModel.countDocuments({ status: 'approved' }),
            RequestModel.countDocuments({ status: 'rejected' }),
        ]);

        // Role Counts (MongoDB Users)
        const [
            totalSuperAdmins,
            totalAdmins,
            totalAgencies,
            totalOperators,
            totalHosts,
            totalSellers,
            totalCustomerSupport
        ] = await Promise.all([
            User.countDocuments({ role: 'superAdmin', isDeleted: false }),
            User.countDocuments({ role: 'admin', isDeleted: false }),
            User.countDocuments({ role: 'agency', isDeleted: false }),
            User.countDocuments({ role: 'operator', isDeleted: false }),
            User.countDocuments({ role: 'host', isDeleted: false }),
            User.countDocuments({ role: 'coinSeller', isDeleted: false }),
            User.countDocuments({ role: 'customerSupport', isDeleted: false }),
        ]);

        // Registration Timeframes
        const todayStart = dayjs().startOf('day').toDate();
        const weekStart = dayjs().subtract(7, 'day').startOf('day').toDate();
        const monthStart = dayjs().subtract(30, 'day').startOf('day').toDate();

        const [todaysRegistrations, weeklyRegistrations, monthlyRegistrations] = await Promise.all([
            User.countDocuments({ createdAt: { $gte: todayStart } }),
            User.countDocuments({ createdAt: { $gte: weekStart } }),
            User.countDocuments({ createdAt: { $gte: monthStart } }),
        ]);

        // User Status Breakdown
        const [activeUsersCount, inactiveUsersCount, blockedUsersCount, deletedUsersCount] = await Promise.all([
            User.countDocuments({ isDeleted: false, isBlocked: false, isActive: true }),
            User.countDocuments({ isDeleted: false, isActive: false }),
            User.countDocuments({ isDeleted: false, isBlocked: true }),
            User.countDocuments({ isDeleted: true }),
        ]);

        // Total users (Global count of app users, excluding panel staff)
        const totalUsers = await User.countDocuments({ isDeleted: false, role: { $nin: PANEL_ACCOUNT_ROLES } });
        const activeUsers = activeUsersCount;

        // Base match for transactions + host filter
        const txMatch = { ...hostFilter };

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
                },
            },
        ]);

        const minutesToday = Math.round((callAggregation[0]?.totalSeconds || 0) / 60);
        const coinsSpentToday = callAggregation[0]?.totalCoins || 0;
        const coinPrice = 0.10;
        const revenueToday = coinsSpentToday * coinPrice;

        const stats = {
            totalUsers,
            activeUsers,
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
                host: totalHosts,
                seller: totalSellers,
                customerSupport: totalCustomerSupport,
            },
            registrations: {
                today: todaysRegistrations,
                weekly: weeklyRegistrations,
                monthly: monthlyRegistrations,
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
        const daysCount = parseInt(days as string);
        const startDate = dayjs().subtract(daysCount, 'day').startOf('day').toDate();

        let revenueData;

        // SuperAdmin sees global Recharge History
        if ((req as any).user?.role === 'superAdmin') {
            revenueData = await RechargeHistory.aggregate([
                { $match: { date: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, revenue: { $sum: '$coins' } } },
                { $sort: { _id: 1 } },
            ]);
        } else {
            // Admin sees Spending on their Hosts
            revenueData = await CoinsTransaction.aggregate([
                { $match: { ...hostFilter, createdAt: { $gte: startDate }, type: TransactionType.VOICE_CALL } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$coinsSpent' } } },
                { $sort: { _id: 1 } },
            ]);
        }

        const formattedData = revenueData.map((item) => ({
            date: item._id,
            revenue: item.revenue * 0.10, // Assuming 1 coin = $0.10
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
        const daysCount = parseInt(days as string);
        const startDate = dayjs().subtract(daysCount, 'day').startOf('day').toDate();

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

        const formattedData = earningsData.map((item) => ({
            date: item._id,
            earnings: item.earnings * 0.10, // Assuming 1 coin = $0.10
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
        const daysCount = parseInt(days as string);
        const startDate = dayjs().subtract(daysCount, 'day').startOf('day').toDate();

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

        const formattedData = callTrends.map((item) => ({
            date: item._id,
            calls: item.calls,
            duration: Math.round(item.duration / 60), // Convert to minutes
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

        const formattedData = distribution.map((item) => ({
            type: item._id,
            total: item.total,
            count: item.count,
        }));

        return sendResponse(res, 200, true, 'Coin distribution fetched successfully', formattedData);
    } catch (error) {
        await Logger('getCoinDistribution', error);
        next(error);
    }
};
