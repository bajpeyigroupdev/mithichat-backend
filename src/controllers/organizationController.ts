import { Request, Response } from 'express';
import { Organization, BranchRegion, Department, Team } from '../models/organization.model';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

export const getOrganizations = async (_req: Request, res: Response) => {
    try {
        const orgs = await Organization.find({ isActive: true }).lean();
        return sendResponse(res, 200, true, 'Organizations fetched', orgs);
    } catch (error: any) {
        await Logger('getOrganizations', error);
        return sendResponse(res, 500, false, 'Failed to fetch organizations');
    }
};

export const createOrganization = async (req: Request, res: Response) => {
    try {
        const { name, code, description, headquartersAddress } = req.body;
        if (!name || !code) {
            return sendResponse(res, 400, false, 'Organization Name and Code are required');
        }

        const existing = await Organization.findOne({ code: code.toUpperCase() });
        if (existing) {
            return sendResponse(res, 400, false, 'Organization with this code already exists');
        }

        const org = await Organization.create({
            name,
            code: code.toUpperCase(),
            description,
            headquartersAddress
        });

        return sendResponse(res, 201, true, 'Organization created successfully', org);
    } catch (error: any) {
        await Logger('createOrganization', error);
        return sendResponse(res, 500, false, 'Failed to create organization');
    }
};

export const getDepartments = async (req: Request, res: Response) => {
    try {
        const { orgId } = req.query;
        const query: any = { isActive: true };
        if (orgId) query.orgId = orgId;

        const departments = await Department.find(query).populate('headUserId', 'name email').lean();
        return sendResponse(res, 200, true, 'Departments fetched', departments);
    } catch (error: any) {
        await Logger('getDepartments', error);
        return sendResponse(res, 500, false, 'Failed to fetch departments');
    }
};

export const createDepartment = async (req: Request, res: Response) => {
    try {
        const { orgId, branchId, name, code, headUserId } = req.body;
        if (!orgId || !name || !code) {
            return sendResponse(res, 400, false, 'Organization ID, Department Name and Code are required');
        }

        const dept = await Department.create({
            orgId,
            branchId,
            name,
            code: code.toUpperCase(),
            headUserId
        });

        return sendResponse(res, 201, true, 'Department created successfully', dept);
    } catch (error: any) {
        await Logger('createDepartment', error);
        return sendResponse(res, 500, false, 'Failed to create department');
    }
};
