import { Request, Response } from 'express';
import { RecruitmentApplication, RecruitmentRole, ApplicationStatus } from '../models/recruitmentApplication.model';
import { User } from '../models/user.model';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';
import { sendRecruitmentWorkflowNotification } from '../services/recruitmentNotification';
import { automateEmployeeCreationOnApproval } from '../services/employeeLifecycleService';

// Helper to generate unique application ID
const generateApplicationId = (role: string): string => {
    const rolePrefixes: Record<string, string> = {
        agency: 'AGY',
        operator: 'OPR',
        admin: 'ADM',
        'customer-service': 'CS',
        'super-admin': 'SA',
    };
    const prefix = rolePrefixes[role] || 'APP';
    const randNum = Math.floor(10000 + Math.random() * 90000);
    return `APP-${prefix}-${randNum}`;
};

// 1. Verify Referral Code Endpoint
export const verifyReferralCode = async (req: Request, res: Response) => {
    try {
        const code = (req.query.code || req.params.code || '').toString().trim();
        if (!code) {
            return sendResponse(res, 400, false, 'Referral code is required');
        }

        const senior = await User.findOne({
            $or: [{ employeeCode: code }, { referralCode: code }],
            isDeleted: { $ne: true }
        }).select('_id name role employeeCode referralCode');

        if (!senior) {
            return sendResponse(res, 404, false, 'Invalid referral code. No referrer found.');
        }

        return sendResponse(res, 200, true, 'Referral code verified successfully', {
            code: senior.employeeCode || senior.referralCode || code,
            referrerId: senior._id,
            referrerName: senior.name,
            referrerRole: senior.role,
        });
    } catch (error: any) {
        await Logger('verifyReferralCode', error);
        return sendResponse(res, 500, false, 'Error verifying referral code');
    }
};

// 2. Submit Recruitment Application Endpoint
export const submitApplication = async (req: Request, res: Response) => {
    try {
        const roleFromParams = req.params.role as RecruitmentRole;
        const body = req.body || {};
        const role = (roleFromParams || body.role || '').toLowerCase() as RecruitmentRole;

        const validRoles: RecruitmentRole[] = ['agency', 'operator', 'admin', 'customer-service', 'super-admin'];
        if (!validRoles.includes(role)) {
            return sendResponse(res, 400, false, `Invalid role. Allowed roles: ${validRoles.join(', ')}`);
        }

        const {
            name,
            email,
            phone,
            gender,
            country,
            city,
            address,
            experienceYears,
            referralCode,
            documents,
            ...roleSpecificFields
        } = body;

        const applicantName = name || roleSpecificFields.businessName || roleSpecificFields.fullName;
        const applicantEmail = email || roleSpecificFields.emailId || roleSpecificFields.officialEmail;
        const applicantPhone = phone || roleSpecificFields.mobileNo || roleSpecificFields.phoneNumber;

        if (!applicantName || !applicantEmail || !applicantPhone) {
            return sendResponse(res, 400, false, 'Full Name, Email, and Phone Number are required.');
        }

        // Check for existing pending/under_review application for same role
        const existingApp = await RecruitmentApplication.findOne({
            'applicant.email': applicantEmail.toLowerCase(),
            role,
            status: { $in: ['pending', 'under_review', 'interview_scheduled'] }
        });

        if (existingApp) {
            return sendResponse(res, 400, false, `An active application for ${role.toUpperCase()} already exists with this email.`);
        }

        // Handle referral validation if provided
        let referrerData: any = undefined;
        if (referralCode) {
            const senior = await User.findOne({
                $or: [{ employeeCode: referralCode }, { referralCode }],
                isDeleted: { $ne: true }
            }).select('_id name role employeeCode referralCode');

            if (senior) {
                referrerData = {
                    code: senior.employeeCode || senior.referralCode || referralCode,
                    referrerId: senior._id,
                    referrerRole: senior.role,
                    referrerName: senior.name
                };
            } else {
                referrerData = {
                    code: referralCode,
                    referrerName: 'External Referral'
                };
            }
        }

        // Parse documents
        let parsedDocs: Array<{ name: string; documentType: string; url: string }> = [];
        if (Array.isArray(documents)) {
            parsedDocs = documents.map((doc: any, idx: number) => {
                if (typeof doc === 'string') {
                    return { name: `Document ${idx + 1}`, documentType: 'Upload', url: doc };
                }
                return {
                    name: doc.name || `Document ${idx + 1}`,
                    documentType: doc.documentType || 'Upload',
                    url: doc.url || doc
                };
            });
        }

        const applicationId = generateApplicationId(role);

        const newApplication = await RecruitmentApplication.create({
            applicationId,
            role,
            status: 'pending',
            applicant: {
                name: applicantName,
                email: applicantEmail.toLowerCase(),
                phone: applicantPhone,
                gender: gender || 'other',
                country: country || 'India',
                city: city || '',
                address: address || '',
                experienceYears: experienceYears || ''
            },
            roleData: roleSpecificFields,
            documents: parsedDocs,
            referrer: referrerData,
            reviewNotes: [{
                authorName: 'System',
                text: 'Application submitted successfully.',
                timestamp: new Date()
            }]
        });

        return sendResponse(res, 201, true, 'Recruitment application submitted successfully!', {
            applicationId: newApplication.applicationId,
            role: newApplication.role,
            status: newApplication.status,
            createdAt: newApplication.createdAt
        });
    } catch (error: any) {
        await Logger('submitApplication', error);
        return sendResponse(res, 500, false, error.message || 'Failed to submit application');
    }
};

// 3. Admin: List Applications
export const getAdminApplications = async (req: Request, res: Response) => {
    try {
        const { role, status, search, page = 1, limit = 20 } = req.query;
        const query: any = {};

        if (role && role !== 'all') {
            query.role = role;
        }

        if (status && status !== 'all') {
            query.status = status;
        }

        if (search) {
            const searchRegex = new RegExp(search.toString().trim(), 'i');
            query.$or = [
                { applicationId: searchRegex },
                { 'applicant.name': searchRegex },
                { 'applicant.email': searchRegex },
                { 'applicant.phone': searchRegex },
                { 'referrer.code': searchRegex }
            ];
        }

        const pageNum = parseInt(page.toString(), 10) || 1;
        const limitNum = parseInt(limit.toString(), 10) || 20;
        const skip = (pageNum - 1) * limitNum;

        const [applications, total] = await Promise.all([
            RecruitmentApplication.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            RecruitmentApplication.countDocuments(query)
        ]);

        return sendResponse(res, 200, true, 'Applications retrieved successfully', {
            applications,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (error: any) {
        await Logger('getAdminApplications', error);
        return sendResponse(res, 500, false, 'Failed to fetch applications');
    }
};

// 4. Admin: Get Single Application
export const getApplicationById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const application = await RecruitmentApplication.findOne({
            $or: [{ _id: id }, { applicationId: id }]
        }).lean();

        if (!application) {
            return sendResponse(res, 404, false, 'Application not found');
        }

        return sendResponse(res, 200, true, 'Application details retrieved', application);
    } catch (error: any) {
        await Logger('getApplicationById', error);
        return sendResponse(res, 500, false, 'Failed to fetch application details');
    }
};

// 5. Admin: Update Application Status
export const updateApplicationStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status, note } = req.body;

        const application = await RecruitmentApplication.findOne({
            $or: [{ _id: id }, { applicationId: id }]
        });

        if (!application) {
            return sendResponse(res, 404, false, 'Application not found');
        }

        const prevStatus = application.status;
        application.status = status;

        const authorName = (req as any).user?.name || 'Admin';
        const authorId = (req as any).user?._id;

        application.reviewNotes.push({
            authorName,
            authorId,
            text: note || `Status changed from ${prevStatus.toUpperCase()} to ${status.toUpperCase()}`,
            statusChange: status as ApplicationStatus,
            timestamp: new Date()
        });

        await application.save();

        // Dispatch background notification trigger
        sendRecruitmentWorkflowNotification({
            applicantName: application.applicant?.name,
            applicantEmail: application.applicant?.email,
            applicationId: application.applicationId,
            role: application.role,
            status,
            customNote: note
        }).catch(() => {});

        // Automate Employee Creation on Approval
        if (status === 'approved') {
            automateEmployeeCreationOnApproval(application.applicationId).catch(() => {});
        }

        return sendResponse(res, 200, true, `Application status updated to ${status}`, application);
    } catch (error: any) {
        await Logger('updateApplicationStatus', error);
        return sendResponse(res, 500, false, 'Failed to update application status');
    }
};

// 6. Admin: Add Review Note
export const addReviewNote = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { note } = req.body;

        if (!note || !note.trim()) {
            return sendResponse(res, 400, false, 'Note text is required');
        }

        const application = await RecruitmentApplication.findOne({
            $or: [{ _id: id }, { applicationId: id }]
        });

        if (!application) {
            return sendResponse(res, 404, false, 'Application not found');
        }

        const authorName = (req as any).user?.name || 'Admin';
        const authorId = (req as any).user?._id;

        application.reviewNotes.push({
            authorName,
            authorId,
            text: note.trim(),
            timestamp: new Date()
        });

        await application.save();

        return sendResponse(res, 200, true, 'Review note added successfully', application.reviewNotes);
    } catch (error: any) {
        await Logger('addReviewNote', error);
        return sendResponse(res, 500, false, 'Failed to add review note');
    }
};
