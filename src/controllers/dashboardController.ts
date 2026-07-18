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

        // Base match for transactions + host filter
        const txMatch = { ...hostFilter };

        // For user counts, Admin only sees their hosts?
        // Let's assume Admin Dashboard shows:
        // Total Users: Maybe 0 or global? -> Let's show Linked Hosts count instead of Users.
        // Total Hosts: Their hosts.

        // Get filter for User model queries
        let userFilter: any = { isDeleted: false };
        let hostUserFilter: any = { isDeleted: false, role: 'host' };

        if ((req as any).user?.role === 'admin') {
            // Admin doesn't manage "Users" (Viewers), only Hosts.
            // So totalUsers might be irrelevant or 0.
            userFilter = { _id: null }; // 0 results
            if (hostFilter.hostId && hostFilter.hostId.$in) {
                hostUserFilter._id = { $in: hostFilter.hostId.$in };
            } else {
                hostUserFilter._id = null;
            }
        }

        // Total users (Global for SuperAdmin, 0 for Admin)
        const totalUsers = await User.countDocuments(userFilter);
        const activeUsers = await User.countDocuments({ ...userFilter, isBlocked: false });

        // Total hosts
        const totalHosts = await User.countDocuments(hostUserFilter);
        const activeHosts = await User.countDocuments({ ...hostUserFilter, isActive: true });

        // Today's date range
        const todayStart = dayjs().startOf('day').toDate();
        const todayEnd = dayjs().endOf('day').toDate();

        // Call stats for today
        const callsToday = await CoinsTransaction.countDocuments({
            ...txMatch,
            type: TransactionType.VOICE_CALL,
            createdAt: { $gte: todayStart, $lte: todayEnd },
        });

        // BUG-09 FIX: 'duration' in CoinsTransaction is stored in SECONDS.
        // The field was misnamed 'totalMinutes' and then divided by 60 again —
        // producing hours instead of minutes. Now correctly named and divided once.
        const callAggregation = await CoinsTransaction.aggregate([
            {
                $match: {
                    ...txMatch,
                    type: TransactionType.VOICE_CALL,
                    status: CallStatus.ENDED,
                    createdAt: { $gte: todayStart, $lte: todayEnd },
                },
            },
            {
                $group: {
                    _id: null,
                    totalSeconds: { $sum: '$duration' }, // duration is in seconds
                    totalCoins: { $sum: '$coinsSpent' },
                },
            },
        ]);

        const minutesToday = Math.round((callAggregation[0]?.totalSeconds || 0) / 60); // convert seconds → minutes
        const coinsSpentToday = callAggregation[0]?.totalCoins || 0;

        // Revenue & Earnings
        const coinPrice = 0.10;
        const revenueToday = coinsSpentToday * coinPrice;

        const hostEarningsAgg = await CoinsTransaction.aggregate([
            {
                $match: {
                    ...txMatch,
                    type: TransactionType.VOICE_CALL,
                    status: CallStatus.ENDED,
                    createdAt: { $gte: todayStart, $lte: todayEnd },
                },
            },
            {
                $group: {
                    _id: null,
                    totalEarnings: { $sum: '$hostEarning' },
                },
            },
        ]);

        const hostEarningsToday = (hostEarningsAgg[0]?.totalEarnings || 0) * coinPrice;

        // Lifetime totals
        // Revenue: SuperAdmin sees all recharges. Admin sees ? 
        // Admin likely sees share of their hosts earnings? Or total spending on their hosts?
        // Let's show Total Spending on My Hosts as "Revenue" for Admin?
        // Or if Admin buys coins to sell... that's different.
        // Assuming Admin Revenue = their profit.
        // For now, let's just query CoinsTransaction sum for them.

        let totalRevenue = 0;
        if ((req as any).user?.role === 'superAdmin') {
            const totalRevenueAgg = await RechargeHistory.aggregate([
                { $group: { _id: null, total: { $sum: '$coins' } } }
            ]);
            totalRevenue = (totalRevenueAgg[0]?.total || 0) * coinPrice;
        } else {
            // Admin Revenue = Total Coins Spent on THEIR hosts * price? (Simple view)
            const adminRevAgg = await CoinsTransaction.aggregate([
                { $match: { ...txMatch, type: TransactionType.VOICE_CALL } },
                { $group: { _id: null, total: { $sum: '$coinsSpent' } } }
            ]);
            totalRevenue = (adminRevAgg[0]?.total || 0) * coinPrice;
        }

        const totalHostEarningsAgg = await CoinsTransaction.aggregate([
            { $match: { ...txMatch, type: TransactionType.VOICE_CALL, status: CallStatus.ENDED } },
            { $group: { _id: null, total: { $sum: '$hostEarning' } } }
        ]);
        const totalHostEarnings = (totalHostEarningsAgg[0]?.total || 0) * coinPrice;

        // Active Calls
        const activeCalls = await User.countDocuments({ ...hostUserFilter, isBusy: true });

        // Pending reports (against my hosts?)
        // Reports usually have 'reportedId'. need to filter by my hosts.
        let reportFilter: any = { status: 'pending' };
        if (hostFilter.hostId) {
            reportFilter.reportedId = hostFilter.hostId; // Assuming Report model has reportedId as ObjectId
        }
        const reportsPending = await Report.countDocuments(reportFilter);

        const stats = {
            totalUsers,
            activeUsers,
            totalHosts,
            activeHosts,
            totalRevenue: parseFloat(totalRevenue.toFixed(2)),
            totalHostEarnings: parseFloat(totalHostEarnings.toFixed(2)),
            activeCalls,
            stats: {
                callsToday,
                minutesToday, // BUG-09 FIX: already in minutes, no further division needed
                coinsSpentToday,
                revenueToday: parseFloat(revenueToday.toFixed(2)),
                hostEarningsToday: parseFloat(hostEarningsToday.toFixed(2)),
            },
            reportsPending,
        };

        return sendResponse(res, 200, true, 'Dashboard stats fetched successfully', stats);
    } catch (error) {
        await Logger('getDashboardStats', error);
        next(new AppError('Error fetching dashboard stats', 500));
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
        next(new AppError('Error fetching revenue chart data', 500));
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
        next(new AppError('Error fetching earnings chart data', 500));
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
        next(new AppError('Error fetching call trends', 500));
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
        next(new AppError('Error fetching coin distribution', 500));
    }
};
