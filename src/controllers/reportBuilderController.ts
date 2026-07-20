import { Request, Response } from 'express';
import { RecruitmentApplication } from '../models/recruitmentApplication.model';
import { Employee } from '../models/employee.model';
import { User } from '../models/user.model';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

export const generateCustomReport = async (req: Request, res: Response) => {
    try {
        const { targetModule, startDate, endDate, format } = req.query;

        let reportData: any[] = [];

        if (targetModule === 'employees') {
            reportData = await Employee.find().populate('userId', 'name email').lean();
        } else if (targetModule === 'users') {
            reportData = await User.find().select('userId name email role isActive createdAt').limit(50).lean();
        } else {
            // Default: recruitment
            reportData = await RecruitmentApplication.find().select('applicationId role status applicant createdAt').lean();
        }

        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="Report-${targetModule || 'general'}.csv"`);
            const header = Object.keys(reportData[0] || {}).join(',');
            const rows = reportData.map(row => Object.values(row).map(v => `"${JSON.stringify(v).replace(/"/g, '""')}"`).join(','));
            return res.status(200).send([header, ...rows].join('\n'));
        }

        return sendResponse(res, 200, true, 'Report data generated successfully', {
            targetModule: targetModule || 'recruitment',
            totalRecords: reportData.length,
            generatedAt: new Date(),
            records: reportData
        });
    } catch (error: any) {
        await Logger('generateCustomReport', error);
        return sendResponse(res, 500, false, 'Failed to generate custom report');
    }
};
