import { Request, Response, NextFunction } from 'express';
import { Report } from '../models/report.model';
import { User } from '../models/user.model';
import sendResponse from '../utils/reponse';
import AppError from '../utils/errorHandler';
import { Logger } from '../utils/logger';

// Get all reports with filters and pagination
export const getAllReports = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            severity,
        } = req.query;

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        // Build filter
        const filter: any = {};
        if (status) filter.status = status;
        if (severity) filter.severity = severity;

        // RBAC: Admin filter
        const { role, userId } = (req as any).user || {};
        if (role === 'admin') {
            const adminUser = await User.findById(userId);
            if (adminUser?.meethiId) {
                // Find hosts belonging to this agency
                const myHosts = await User.find({ meethiId: adminUser.meethiId }).select('_id');
                const hostIds = myHosts.map(h => h._id);

                // Admin sees reports AGAINST their hosts
                filter.reportedUserId = { $in: hostIds };
            } else {
                // No MeethiId, no reports
                return sendResponse(res, 200, true, 'Reports fetched successfully', { reports: [], pagination: { totalCount: 0 } });
            }
        } else if (role !== 'superAdmin') {
            return sendResponse(res, 403, false, 'Access Denied');
        }

        const reports = await Report.find(filter)
            .populate('reporterId', 'name email userId')
            .populate('reportedUserId', 'name email userId')
            .populate('resolvedBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        const totalCount = await Report.countDocuments(filter);
        const totalPages = Math.ceil(totalCount / limitNum);

        const data = {
            reports,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalCount,
                hasNext: pageNum < totalPages,
                hasPrev: pageNum > 1,
            },
        };

        return sendResponse(res, 200, true, 'Reports fetched successfully', data);
    } catch (error) {
        await Logger('getAllReports', error);
        next(new AppError('Error fetching reports', 500));
    }
};

// Get report by ID
export const getReportById = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = req.params;

        const report = await Report.findById(id)
            .populate('reporterId', 'name email userId image')
            .populate('reportedUserId', 'name email userId image')
            .populate('resolvedBy', 'name email');

        if (!report) {
            return next(new AppError('Report not found', 404));
        }

        return sendResponse(res, 200, true, 'Report fetched successfully', report);
    } catch (error) {
        await Logger('getReportById', error);
        next(new AppError('Error fetching report', 500));
    }
};

// Resolve report
export const resolveReport = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = req.params;
        const { actionTaken, blockUser } = req.body;
        const adminId = (req as any).user._id;

        const report = await Report.findById(id);
        if (!report) {
            return next(new AppError('Report not found', 404));
        }

        // Update report status
        report.status = 'resolved';
        report.resolvedBy = adminId;
        report.resolvedAt = new Date();
        report.actionTaken = actionTaken || 'User warned';
        await report.save();

        // Optionally block the reported user
        if (blockUser) {
            await User.findByIdAndUpdate(report.reportedUserId, {
                isBlocked: true,
            });
        }

        return sendResponse(res, 200, true, 'Report resolved successfully', report);
    } catch (error) {
        await Logger('resolveReport', error);
        next(new AppError('Error resolving report', 500));
    }
};

// Dismiss report
export const dismissReport = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = req.params;
        const adminId = (req as any).user._id;

        const report = await Report.findById(id);
        if (!report) {
            return next(new AppError('Report not found', 404));
        }

        report.status = 'dismissed';
        report.resolvedBy = adminId;
        report.resolvedAt = new Date();
        await report.save();

        return sendResponse(res, 200, true, 'Report dismissed successfully', report);
    } catch (error) {
        await Logger('dismissReport', error);
        next(new AppError('Error dismissing report', 500));
    }
};

// Create new report (for users to report)
export const createReport = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { reportedUserId, reason, description, severity } = req.body;
        const reporterId = (req as any).user._id;

        // Generate unique report ID
        const reportCount = await Report.countDocuments();
        const reportId = `RPT-${(reportCount + 1).toString().padStart(4, '0')}`;

        const report = await Report.create({
            reportId,
            reporterId,
            reportedUserId,
            reason,
            description,
            severity: severity || 'medium',
            status: 'pending',
        });

        return sendResponse(res, 201, true, 'Report created successfully', report);
    } catch (error) {
        await Logger('createReport', error);
        next(new AppError('Error creating report', 500));
    }
};
