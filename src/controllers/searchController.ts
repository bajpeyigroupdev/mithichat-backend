import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { Employee } from '../models/employee.model';
import { RecruitmentApplication } from '../models/recruitmentApplication.model';
import Host from '../models/host.model';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

export const globalSearch = async (req: Request, res: Response) => {
    try {
        const queryStr = (req.query.q || '').toString().trim();
        if (!queryStr || queryStr.length < 2) {
            return sendResponse(res, 200, true, 'Query string too short', { results: [] });
        }

        const regex = new RegExp(queryStr, 'i');

        const [users, employees, recruitmentApps, hosts] = await Promise.all([
            User.find({ $or: [{ name: regex }, { email: regex }, { phoneNumber: regex }, { employeeCode: regex }] })
                .select('_id name email role employeeCode')
                .limit(5)
                .lean(),
            Employee.find({ $or: [{ employeeCode: regex }, { designation: regex }] })
                .select('_id employeeCode designation status')
                .limit(5)
                .lean(),
            RecruitmentApplication.find({ $or: [{ applicationId: regex }, { 'applicant.name': regex }, { 'applicant.email': regex }] })
                .select('_id applicationId role status applicant')
                .limit(5)
                .lean(),
            Host.find({ $or: [{ meethiId: regex }, { fullName: regex }, { emailId: regex }] })
                .select('_id meethiId fullName emailId isApproved')
                .limit(5)
                .lean()
        ]);

        const results = [
            ...users.map(u => ({ type: 'User', title: u.name || 'User', subtitle: `${u.role?.toUpperCase()} • ${u.email || u.employeeCode || ''}`, link: `/users` })),
            ...employees.map(e => ({ type: 'Employee', title: e.employeeCode, subtitle: `${e.designation} • ${e.status}`, link: `/employees` })),
            ...recruitmentApps.map(r => ({ type: 'Recruitment', title: r.applicationId, subtitle: `${r.applicant?.name} (${r.role.toUpperCase()})`, link: `/recruitment` })),
            ...hosts.map(h => ({ type: 'Host', title: h.fullName, subtitle: `ID: ${h.meethiId} • ${h.emailId}`, link: `/hosts` }))
        ];

        return sendResponse(res, 200, true, 'Global search results', { results });
    } catch (error: any) {
        await Logger('globalSearch', error);
        return sendResponse(res, 500, false, 'Failed to perform global search');
    }
};
