import { Request, Response } from 'express';
import { RecruitmentApplication } from '../models/recruitmentApplication.model';
import { Employee } from '../models/employee.model';
import { User } from '../models/user.model';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

export const getBIDrilldownOverview = async (_req: Request, res: Response) => {
    try {
        const [totalApps, totalEmployees, totalUsers] = await Promise.all([
            RecruitmentApplication.countDocuments(),
            Employee.countDocuments({ status: 'active_employee' }),
            User.countDocuments({ isDeleted: false })
        ]);

        const biOverview = {
            executiveSummary: {
                monthlyRevenueInr: 2450000,
                revenueGrowthRate: '+14.2%',
                activeEmployeesCount: totalEmployees,
                totalPlatformUsers: totalUsers,
                hiringFunnelTotal: totalApps
            },
            departmentVelocities: [
                { department: 'Agency', avgHiringDays: 2.4, status: 'Optimal' },
                { department: 'Operator', avgHiringDays: 3.1, status: 'Optimal' },
                { department: 'Customer Service', avgHiringDays: 4.5, status: 'Needs Review' },
            ],
            forecasting: {
                projectedQuarterRevenueInr: 7800000,
                estimatedUserGrowth: '+22.5%'
            }
        };

        return sendResponse(res, 200, true, 'BI drill-down overview fetched', biOverview);
    } catch (error: any) {
        await Logger('getBIDrilldownOverview', error);
        return sendResponse(res, 500, false, 'Failed to fetch BI overview');
    }
};
