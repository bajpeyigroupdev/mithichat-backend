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

        const escapedQuery = queryStr.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const regex = new RegExp(escapedQuery, 'i');
        const numQuery = !isNaN(Number(queryStr)) ? Number(queryStr) : null;

        const userOrConditions: any[] = [
            { name: regex },
            { email: regex },
            { phoneNumber: regex },
            { employeeCode: regex },
            { specialCode: regex },
            { meethiId: regex },
            { referralCode: regex },
            ...(numQuery ? [{ userId: numQuery }] : [])
        ];

        // If queryStr is a valid Mongo ObjectId, search by _id as well
        if (/^[0-9a-fA-F]{24}$/.test(queryStr)) {
            userOrConditions.push({ _id: queryStr });
        }

        const users = await User.find({ $or: userOrConditions })
            .select('_id name email phoneNumber role employeeCode specialCode meethiId status loginUrl')
            .limit(10)
            .lean();

        const results = users.map(u => {
            const roleStr = String(u.role || '').toLowerCase();
            const rolePath = roleStr === 'superadmin' ? '/super-admins' :
                             roleStr === 'admin' ? '/admins' :
                             roleStr === 'agency' ? '/agencies' :
                             roleStr === 'operator' ? '/operators' :
                             roleStr === 'host' ? '/hosts' :
                             roleStr === 'coinseller' || roleStr === 'seller' ? '/sellers' :
                             roleStr === 'customersupport' || roleStr === 'support' ? '/customer-support' : '/users';

            return {
                id: u._id,
                type: (u.role || 'User').toUpperCase(),
                title: u.name || 'User Profile',
                subtitle: `EMP: ${u.employeeCode || u.specialCode || u._id} | ID: ${u.meethiId || 'N/A'} | ${u.email || u.phoneNumber || ''}`,
                employeeCode: u.employeeCode,
                roleCode: u.specialCode,
                meethiId: u.meethiId,
                email: u.email,
                phoneNumber: u.phoneNumber,
                link: rolePath
            };
        });

        return sendResponse(res, 200, true, 'Global search results retrieved', { results });
    } catch (error: any) {
        await Logger('globalSearch', error);
        return sendResponse(res, 500, false, 'Failed to perform global search', { error: error.message });
    }
};
