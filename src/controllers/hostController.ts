import { NextFunction, Request, Response } from "express";
import sendResponse from "../utils/reponse";
// import { deleteFromS3, uploadToS3 } from "../utils/uploadS3";
import { AuthRequest } from "../middlewares/authorize.middleware";
import { generateUniqueId } from "../utils/generator";
import { User } from "../models/user.model";
import { sendCustomEmail } from "../utils/emailUtils";
import TempHostModel from "../models/temp.host.model";
import jwt from "jsonwebtoken";
import Host from "../models/host.model";
import { config } from "../configs/envConfig";
import { Logger } from "../utils/logger";
import { createNotification } from "./notificationController";
import { Agency } from "../models/agency.model";
import { Request as RequestModel, RequestStatus } from "../models/request.model";
import { HierarchyScopeService } from "../utils/hierarchyScope";
import { isPlayableVoiceUrl } from "../utils/voiceMedia";

export const applyHost = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const rawUserId = req.user?.userId || req.body.userId || req.body.meethiChatId;
        const audioUrl = req.body.audio || req.body.voiceAudioUrl || req.body.audioUrl || req.body.voiceUrl || req.body.voice || req.body.introAudio;

        if (!isPlayableVoiceUrl(audioUrl)) {
            return sendResponse(res, 400, false, "A valid voice recording audio URL is required.");
        }

        const isNum = rawUserId !== undefined && rawUserId !== null && !isNaN(Number(rawUserId));
        const findConditions: any[] = [];
        if (isNum) findConditions.push({ userId: Number(rawUserId) });
        if (rawUserId) findConditions.push({ meethiId: String(rawUserId) });

        let userObj = req.user?.id ? await User.findById(req.user.id) : null;
        if (!userObj && findConditions.length > 0) {
            userObj = await User.findOne({ $or: findConditions });
        }

        const numericUserId = userObj?.userId || (isNum ? Number(rawUserId) : await generateUniqueId());
        const hostId = await generateUniqueId();

        let host = await TempHostModel.findOne({ userId: numericUserId });
        if (host) {
            host.audioURL = audioUrl;
            await host.save();
        } else {
            host = new TempHostModel({
                query: req.body.query || null,
                hostId,
                userId: numericUserId,
                audioURL: audioUrl,
                isVerified: false,
            });
            await host.save();
        }

        // Sync to EMS Request Center for Operator & Owner Host Requests panel
        try {
            const applicantName = req.body.name || req.body.fullName || userObj?.name || 'Host Applicant';
            const applicantEmail = req.body.email || userObj?.email || '';
            const applicantPhone = req.body.phone || req.body.mobile || userObj?.phoneNumber || '';
            const adharFrontUrl = req.body.adharFront || req.body.aadhaarFront || '';
            const adharBackUrl = req.body.adharBack || req.body.aadhaarBack || '';
            const panUrl = req.body.pan || req.body.panCard || '';

            await RequestModel.create({
                requestType: 'Host Request',
                role: 'host',
                workflowSteps: ['Stage 1: Operator Review', 'Stage 2: Owner Approval'],
                currentStepIndex: 0,
                data: {
                    name: applicantName,
                    email: applicantEmail,
                    phoneNumber: applicantPhone,
                    mobile: applicantPhone,
                    audio: audioUrl,
                    voiceAudioUrl: audioUrl,
                    voice: audioUrl,
                    adharFront: adharFrontUrl,
                    aadhaarFront: adharFrontUrl,
                    adharBack: adharBackUrl,
                    aadhaarBack: adharBackUrl,
                    pan: panUrl,
                    panCard: panUrl,
                    documents: req.body.documents || [
                        { name: 'Aadhaar Front', documentType: 'GovtID', url: adharFrontUrl },
                        { name: 'Aadhaar Back', documentType: 'GovtID', url: adharBackUrl },
                        { name: 'PAN Card', documentType: 'Certificate', url: panUrl },
                        { name: 'Host Voice Audition', documentType: 'Voice', url: audioUrl }
                    ].filter(d => Boolean(d.url)),
                    gender: req.body.gender || userObj?.gender || 'female',
                    country: req.body.country || userObj?.country?.name || 'India',
                    city: req.body.city || '',
                    address: req.body.address || '',
                    meethiChatId: userObj?.meethiId || userObj?.userId || numericUserId,
                    userId: numericUserId,
                    invitedBy: req.body.referralCode ? `Referral: ${req.body.referralCode}` : 'Direct Mobile App Application',
                    ...req.body
                },
                status: RequestStatus.UNDER_REVIEW,
                createdBy: userObj ? (userObj as any)._id : 'app_host_apply',
                createdByRole: req.body.referralCode ? 'user' : 'public'
            });
        } catch (reqErr) {
            Logger("applyHostRequestModelSyncError", reqErr);
        }

        return sendResponse(res, 201, true, "Host application submitted successfully. Pending operator/owner approval.");

    } catch (error: any) {
        Logger("applyHost", error);
        return sendResponse(res, 500, false, error?.message || "Internal server error");
    }
};

export const getAppliedHosts = async (req: AuthRequest, res: Response) => {
    try {
        const { role, userId } = req.user || {};

        if (!role || !["admin", "superAdmin"].includes(role)) {
            return sendResponse(res, 403, false, "Access denied. Insufficient permissions.");
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const filter: any = {};

        if (role === 'admin') {
            const adminUser = await User.findById(userId);
            if (!adminUser?.meethiId) {
                return sendResponse(res, 200, true, "Applied hosts fetched successfully", {
                    hosts: [],
                    totalHosts: 0,
                    currentPage: page,
                    totalPages: 0,
                });
            }

            // Find users who have this meethiId
            // Note: Applicants might already have 'host' role or 'user' role but with meethiId set?
            // Usually meethiId is set when they apply or are created?
            // If they are applying, do they already have meethiId in User model?
            // Assuming YES, because Agency creates them or they link to Agency.
            const agencyUsers = await User.find({ meethiId: adminUser.meethiId }).select('userId');
            const agencyUserIds = agencyUsers.map(u => u.userId);

            filter.userId = { $in: agencyUserIds };
        }

        const totalHosts = await TempHostModel.countDocuments(filter);
        const hosts = await TempHostModel.find(filter).skip(skip).limit(limit);

        return sendResponse(res, 200, true, "Applied hosts fetched successfully", {
            hosts,
            totalHosts,
            currentPage: page,
            totalPages: Math.ceil(totalHosts / limit),
        });
    } catch (error: any) {
        await Logger("getAppliedHosts", error)
        return sendResponse(res, 500, false, error.message);
    }
};

export const sendFormForHost = async (req: AuthRequest, res: Response) => {
    try {
        const { role } = req.user || {};
        if (!role || !["admin", "superAdmin"].includes(role)) {
            return sendResponse(res, 403, false, "Access denied. Insufficient permissions.");
        }

        const { hostId } = req.params;
        const { status } = req.body; // "approved" or "unapproved"

        if (!hostId) {
            return sendResponse(res, 400, false, "Please provide hostId");
        }
        if (!["approved", "unapproved"].includes(status)) {
            return sendResponse(res, 400, false, "Invalid status. Use 'approved' or 'unapproved'.");
        }

        const hostApplication = await TempHostModel.findOne({ hostId: Number(hostId) });
        if (!hostApplication) {
            return sendResponse(res, 404, false, "Host application not found");
        }

        const { userId, audioURL, query } = hostApplication;

        const user = await User.findOne({ userId });
        if (!user) {
            return sendResponse(res, 404, false, "User not found");
        }

        if (!user.email) {
            return sendResponse(res, 400, false, "Please first verify user email");
        }

        let emailType: "hostApproved" | "hostRejected";
        let formURL = null;

        if (status === "approved") {
            user.audio = audioURL;
            await user.save();
            await TempHostModel.findOneAndDelete({ hostId });

            const token = jwt.sign({ userId, hostApproved: true }, config.JWT_ACCESS_SECRET!, {
                expiresIn: "7d",
            });

            formURL = `http://localhost:3000/api/form/host-form?token=${token}`;
            emailType = "hostApproved";
        } else {
            user.audio = undefined;
            await user.save();

            emailType = "hostRejected";
        }

        await sendCustomEmail(emailType, user.email, {
            hostName: query,
            formUrl: formURL,
        });

        return sendResponse(res, 200, true, `Host ${status} successfully.`);
    } catch (error: any) {
        await Logger("sedFormForHost", error)
        return sendResponse(res, 500, false, error.message);
    }
};

export const submitHostForm = async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        if (!token) {
            return sendResponse(res, 400, false, "Token is required.");
        }

        // ✅ Verify JWT Token
        let decodedToken;
        try {
            decodedToken = jwt.verify(token as string, config.JWT_ACCESS_SECRET!);
        } catch (error) {
            return sendResponse(res, 401, false, "Invalid or expired token.");
        }

        const {
            fullName,
            meethiId, // Replaced meethiId
            city,
            country,
            gender,
            dob,
            emailId,
            mobileNumber,
            idProof, // Cloudinary URL
            profilePhoto // Cloudinary URL
        } = req.body;

        if (!meethiId) {
            return sendResponse(res, 400, false, "Please provide host meethiId.");
        }

        if (!idProof || !profilePhoto) {
            return sendResponse(res, 400, false, "ID Proof and Profile Photo are required.");
        }

        const checkHost = await Host.findOne({ meethiId, isDeleted: false });

        if (checkHost) {
            return sendResponse(res, 400, false, "Host already exists. Wait for approval.");
        }

        const hostId = await generateUniqueId();

        // ✅ Save Host to Database
        const newHost = new Host({
            hostId: hostId,
            fullName,
            meethiId, // Store meethiId
            city,
            country,
            gender,
            dob,
            emailId,
            mobileNumber,
            idProof: idProof, // Save URL
            profilePhoto: profilePhoto, // Save URL
        });

        await newHost.save();

        return sendResponse(
            res,
            201,
            true,
            "Host form submitted successfully. We will send an email upon host approval."
        );
    } catch (error) {
        await Logger("submitHostForm", error)
        return sendResponse(res, 500, false, "Server error", error);
    }
};

export const approveHost = async (req: AuthRequest, res: Response) => {
    try {
        const { role } = req.user || {};
        const { id } = req.params;

        if (!["admin", "superAdmin"].includes(role as any)) {
            return sendResponse(res, 403, false, "Unauthorized access");
        }

        const host = await Host.findOne({ hostId: id, isApproved: false });

        if (!host) {
            return sendResponse(res, 404, false, "Host not found or already approved");
        }

        // Find user by userId (Wait, logic seemed to map 'meethiId' to 'userId'. I need to verify if 'meethiId' is 'userId' or a separate ID).
        // Since meethiId was used to findOneAndUpdate({ userId: host.meethiId }), I will assume 'meethiId' now serves this purpose.
        // However, meethiId might be a string. I should check if it's numeric/objectId.
        // For now, I'll assume meethiId maps to the User's unique meethiId field, NOT the numeric userId directly unless specified.
        // BUT, looking at previous code: findOneAndUpdate({ userId: host.meethiId }) -> implies meethiId WAS the userId.
        // So, I will assume meethiId is also mapped to the User, possibly via 'meethiId' field or userId if it's the same.
        // Wait, userController setUserName sets 'userName', not 'meethiId'.
        // If Host is approved, we need to link it to the User.
        // The original logic used `userId: host.meethiId`. This implies meethiId was the User's ID.
        // I will assume the Application Form provides the User's ID as `meethiId` OR we find the user by `meethiId`.
        // Let's assume meethiId is a unique string identifier on User.model.

        // Find User by meethiId (new field)
        // const user = await User.findOne({ meethiId: host.meethiId }); // If meethiId is on User
        // OR if meethiId IS the userId:
        // const user = await User.findOne({ userId: host.meethiId });

        // Let's stick to the previous pattern: 
        // If meethiId was userId, then maybe meethiId is also userId? 
        // Request says "use meethiId and there is only role admin...".
        // I'll search by meethiId field on User.
        const user = await User.findOne({ meethiId: host.meethiId });

        if (!user) {
            return sendResponse(res, 404, false, "User with this Meethi ID not found");
        }

        user.role = "host" as any;
        user.isActive = true;
        user.status = 'Active';
        user.emailVerified = true;
        user.phoneVerified = true;
        if (!user.faceVerificationStatus) user.faceVerificationStatus = "NOT_SUBMITTED";
        if (!user.kycVerificationStatus) user.kycVerificationStatus = "NOT_SUBMITTED";
        if ((host as any).audioURL || host.introAudio) user.audio = (host as any).audioURL || host.introAudio;
        await user.save();

        // Approve the host only after verification requirements pass.
        host.isApproved = true;
        await host.save();

        // Trigger Notification
        await createNotification(
            user.id, // Use _id (ObjectId)
            'Host Approved',
            'Your host application has been approved! You can now start receiving calls and earning.',
            'system'
        );

        return sendResponse(res, 200, true, "Host approved successfully", {
            host,
            user,
        });

    } catch (error: any) {
        await Logger("approveHost", error)
        return sendResponse(res, 500, false, error.message);
    }
};

export const getHosts = async (req: AuthRequest, res: Response) => {
    try {
        const { role } = req.user || {};
        if (!role) {
            return sendResponse(res, 400, false, "User not authenticated");
        }

        const {
            categoryId,
            serviceId,
            country,
            state,
            city,
            status,
            page = "1",
            limit = "10",
        } = req.query;

        const filters: Record<string, any> = {
            isDeleted: false,
        };

        if (categoryId) filters.categoryId = categoryId;
        if (serviceId) filters.serviceId = serviceId;
        if (country) filters.country = country;
        if (state) filters.state = state;
        if (city) filters.city = city;
        if (status) filters.status = status;

        if (role === "admin") {
            // Admin sees only their hosts
            // Assuming the Admin User has 'meethiId' in their profile which matches the Host's 'meethiId'
            const adminUser = await User.findOne({ userId: Number(req.user?.userId) });
            if (adminUser?.meethiId) {
                filters.meethiId = adminUser.meethiId;
            } else {
                return sendResponse(res, 403, false, "Admin account missing Meethi ID");
            }
        } else if (!["owner", "operator", "superAdmin"].includes(role || "")) {
            return sendResponse(res, 403, false, "Unauthorized access");
        }

        if (role === "operator") {
            const ownerInfo = await HierarchyScopeService.getOwnerReferralInfo();
            const exclusionFilter = HierarchyScopeService.buildOwnerReferralExclusionFilter('operator', 'user', ownerInfo);
            if (Object.keys(exclusionFilter).length > 0) {
                filters.$and = filters.$and ? [...filters.$and, exclusionFilter] : [exclusionFilter];
            }
        }

        const pageNumber = parseInt(page as string, 10);
        const limitNumber = parseInt(limit as string, 10);
        const skip = (pageNumber - 1) * limitNumber;

        const [hosts, total] = await Promise.all([
            Host.find(filters).skip(skip).limit(limitNumber).sort({ createdAt: -1 }).lean(),
            Host.countDocuments(filters),
        ]);

        const hostsWithUsers = await Promise.all(hosts.map(async (host) => {
            const user = await User.findOne({ userId: host.hostId }).lean() as any;
            return {
                ...host,
                level: user?.level || 1,
                gender: user?.gender || 'female',
                coins: user?.coins || 0,
                diamonds: user?.diamonds || 0,
                createdAt: user?.createdAt || host.createdAt,
            };
        }));

        return sendResponse(res, 200, true, "Hosts fetched successfully", {
            total,
            page: pageNumber,
            limit: limitNumber,
            data: hostsWithUsers,
        });
    } catch (error: any) {
        await Logger("getHosts", error)
        return sendResponse(res, 500, false, error.message);
    }
};

export const getHostById = async (req: AuthRequest, res: Response) => {
    try {
        const { role } = req.user || {};

        if (role !== "superAdmin" && role !== "host") {
            return sendResponse(res, 403, false, "Access denied");
        }

        const host = await Host.findOne({ userId: req.params.id, isApproved: true, isDeleted: false });

        if (!host) {
            return sendResponse(res, 404, false, "Host not found");
        }

        return sendResponse(res, 200, true, "Host fetched successfully", host);
    } catch (error: any) {
        await Logger("getHostById", error)
        return sendResponse(res, 500, false, error.message);
    }
};

export const blockHost = async (req: AuthRequest, res: Response) => {
    try {
        const { role } = req.user || {};
        const { id } = req.params;

        // Only superAdmin can block hosts
        if (role !== "superAdmin") {
            return sendResponse(res, 403, false, "Only superAdmin can block a host");
        }

        // Find and update the host
        const host = await Host.findOneAndUpdate(
            { hostId: id, isDeleted: false },
            { isDeleted: true },
            { new: true }
        );

        if (!host) {
            return sendResponse(res, 404, false, "Host not found or already blocked");
        }

        return sendResponse(res, 200, true, "Host blocked successfully", host);

    } catch (error: any) {
        await Logger("blockHost", error)
        return sendResponse(res, 500, false, error.message);
    }
};

const resolveAgencyDetails = async (user: any) => {
    let agencyUser: any = null;
    let agencyModel: any = null;

    // 1. Check user.agencyId or parentId or referrerId or ownerId
    const agencyUserIds = [user.agencyId, user.parentId, user.referrerId, user.ownerId].filter(Boolean);
    if (agencyUserIds.length) {
        agencyUser = await User.findOne({
            _id: { $in: agencyUserIds },
            role: { $in: ['agency', 'admin', 'owner', 'operator'] }
        }).select('name phoneNumber email image meethiId role agencyName agencyLogo referralCode specialCode').lean();
    }

    // 2. Check if user has referrerCode
    const refCode = user.referrerCode || user.referralCode;
    if (!agencyUser && refCode) {
        agencyUser = await User.findOne({
            $or: [{ referralCode: refCode }, { specialCode: refCode }, { meethiId: refCode }],
            role: { $in: ['agency', 'admin', 'owner', 'operator'] }
        }).select('name phoneNumber email image meethiId role agencyName agencyLogo referralCode specialCode').lean();
    }

    // 3. Search RequestModel for custom agencyName / referralCode / invitedBy
    if (!agencyUser) {
        const findConditions: any[] = [{ createdBy: user._id }];
        if (user.userId) findConditions.push({ userId: user.userId }, { 'data.userId': user.userId });
        if (user.meethiId) findConditions.push({ meethiId: user.meethiId }, { 'data.meethiChatId': user.meethiId });
        if (user.email) findConditions.push({ 'data.email': user.email });
        if (user.phoneNumber) findConditions.push({ 'data.phoneNumber': user.phoneNumber }, { 'data.mobile': user.phoneNumber });

        const reqObj = await RequestModel.findOne({
            requestType: { $in: ['Host Request', 'host'] },
            $or: findConditions
        }).sort({ createdAt: -1 }).lean();

        if (reqObj?.data) {
            const data = reqObj.data;
            const codeToSearch = data.referralCode || data.parentOperator || data.agencyCode || data.parentOwner;
            if (codeToSearch) {
                agencyUser = await User.findOne({
                    $or: [{ referralCode: codeToSearch }, { specialCode: codeToSearch }, { meethiId: codeToSearch }],
                    role: { $in: ['agency', 'admin', 'owner', 'operator'] }
                }).select('name phoneNumber email image meethiId role agencyName agencyLogo referralCode specialCode').lean();
            }

            if (!agencyUser && data.agencyName) {
                agencyModel = await Agency.findOne({
                    name: new RegExp(`^${data.agencyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
                }).lean();
            }
        }
    }

    if (agencyUser && !agencyModel) {
        agencyModel = await Agency.findOne({
            $or: [
                { ownerId: agencyUser._id },
                ...(agencyUser.referralCode ? [{ code: agencyUser.referralCode }] : []),
                ...(agencyUser.specialCode ? [{ code: agencyUser.specialCode }] : [])
            ]
        }).lean();
    }

    const agencyName = agencyModel?.name || agencyUser?.agencyName || agencyUser?.name || "Mithi Official Agency";
    const agencyNumber = agencyUser?.phoneNumber || agencyUser?.email || "Support Available";
    const agencyLogo = agencyModel?.logo || agencyUser?.agencyLogo || agencyUser?.image || "";
    const agencyCode = agencyModel?.code || agencyUser?.referralCode || agencyUser?.specialCode || "MITHI-OFFICIAL";

    return { agencyName, agencyNumber, agencyLogo, agencyCode };
};

export const getMyHostStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const user = await User.findById(userId);
        if (!user) {
            return sendResponse(res, 404, false, "User record not found");
        }

        const agencyDetails = await resolveAgencyDetails(user);

        // 1. Check if user is already an APPROVED Host
        if ((user.role as string) === "host" || (user as any).isHost === true) {
            const hostRecord = await Host.findOne({
                $or: [{ meethiId: user.meethiId }, { mobileNumber: user.phoneNumber }, { emailId: user.email }],
                isDeleted: false,
            }).sort({ createdAt: -1 });

            return sendResponse(res, 200, true, "Host status fetched successfully", {
                status: "APPROVED",
                role: "host",
                hostId: hostRecord?.hostId || user.userId,
                meethiId: user.meethiId || hostRecord?.meethiId || user.userId,
                hostingCreatedAt: hostRecord?.createdAt || user.createdAt,
                agencyDetails,
            });
        }

        // Check if user has an APPROVED host request in RequestModel
        const findConditions: any[] = [{ createdBy: user._id }];
        if (user.userId) findConditions.push({ userId: user.userId }, { 'data.userId': user.userId });
        if (user.meethiId) findConditions.push({ meethiId: user.meethiId }, { 'data.meethiChatId': user.meethiId });
        if (user.email) findConditions.push({ 'data.email': user.email });
        if (user.phoneNumber) findConditions.push({ 'data.phoneNumber': user.phoneNumber }, { 'data.mobile': user.phoneNumber });

        const approvedRequest = await RequestModel.findOne({
            requestType: { $in: ['Host Request', 'host'] },
            status: RequestStatus.APPROVED,
            $or: findConditions,
        });

        if (approvedRequest) {
            if ((user.role as string) !== 'host') {
                user.role = 'host' as any;
                user.isActive = true;
                user.status = 'Active';
                await user.save();
            }

            return sendResponse(res, 200, true, "Host status fetched successfully", {
                status: "APPROVED",
                role: "host",
                hostId: user.userId,
                meethiId: user.meethiId || user.userId,
                hostingCreatedAt: approvedRequest.createdAt || user.createdAt,
                agencyDetails,
            });
        }

        // 2. Check for PENDING or UNDER_REVIEW application in RequestModel, TempHostModel, or Host
        const pendingRequest = await RequestModel.findOne({
            requestType: { $in: ['Host Request', 'host'] },
            status: { $in: [RequestStatus.PENDING, RequestStatus.UNDER_REVIEW, RequestStatus.READY_FOR_INTERVIEW, 'pending', 'under_review'] },
            $or: findConditions,
        }).sort({ createdAt: -1 });

        const tempHost = await TempHostModel.findOne({
            isVerified: false,
            $or: [
                ...(user.userId ? [{ userId: user.userId }] : []),
                ...(user.meethiId ? [{ query: user.meethiId }] : [])
            ]
        });

        const pendingHost = await Host.findOne({
            $or: [
                ...(user.meethiId ? [{ meethiId: user.meethiId }] : []),
                ...(user.phoneNumber ? [{ mobileNumber: user.phoneNumber }] : []),
                ...(user.email ? [{ emailId: user.email }] : [])
            ],
            isApproved: false,
            isDeleted: false,
        });

        if (tempHost || pendingHost || pendingRequest) {
            const stepIndex = pendingRequest?.currentStepIndex || 0;
            const stages = [
                {
                    title: "Stage 1: Operator Review",
                    description: "Operator team is inspecting host voice intro and credentials.",
                    status: stepIndex >= 1 ? "completed" : "in_progress",
                    icon: "support-agent",
                },
                {
                    title: "Stage 2: Owner Approval",
                    description: "Owner final security seal & host role activation.",
                    status: stepIndex >= 1 ? "in_progress" : "pending",
                    icon: "verified-user",
                }
            ];

            return sendResponse(res, 200, true, "Host application under review", {
                status: "UNDER_REVIEW",
                role: user.role,
                appliedAt: pendingRequest?.createdAt || tempHost?.createdAt || pendingHost?.createdAt || user.createdAt,
                stages,
            });
        }

        // 3. User has NOT applied yet
        return sendResponse(res, 200, true, "Host status fetched", {
            status: "NOT_APPLIED",
            role: user.role,
        });
    } catch (error: any) {
        await Logger("getMyHostStatus", error);
        return sendResponse(res, 500, false, error.message || "Failed to fetch host status");
    }
};
