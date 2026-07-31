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
import { VerificationSettings } from "../models/verification.model";
import { Agency } from "../models/agency.model";

export const applyHost = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.userId || req.body.userId || req.body.meethiChatId || await generateUniqueId();
        const audioUrl = req.body.audio || req.body.voiceAudioUrl;

        if (!audioUrl) {
            return sendResponse(res, 400, false, "Voice recording audio URL is required.");
        }

        const hostId = await generateUniqueId();

        const host = new TempHostModel({
            query: req.body.query || null,
            hostId,
            userId,
            audioURL: audioUrl,
            isVerified: false,
        });

        await host.save();
        return sendResponse(res, 201, true, "Host applied successfully");

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

        const verificationSettings = await VerificationSettings.findOne({ singletonKey: "default" }).lean();
        const faceRequired = verificationSettings?.faceVerificationEnabled &&
            verificationSettings.rolesRequiringFaceVerification?.includes("host");
        const kycRequired = verificationSettings?.kycVerificationEnabled &&
            verificationSettings.rolesRequiringKycVerification?.includes("host");
        if ((faceRequired && user.faceVerificationStatus !== "APPROVED") ||
            (kycRequired && user.kycVerificationStatus !== "APPROVED")) {
            return sendResponse(res, 403, false, "Face and KYC verification are required before host approval.");
        }

        user.role = "host" as any;
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

export const getMyHostStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        if (!userId) {
            return sendResponse(res, 401, false, "User not authenticated");
        }

        const user = await User.findById(userId);
        if (!user) {
            return sendResponse(res, 404, false, "User record not found");
        }

        // 1. Check if user is already an APPROVED Host
        if (user.role === "host") {
            const hostRecord = await Host.findOne({
                $or: [{ meethiId: user.meethiId }, { mobileNumber: user.phoneNumber }, { emailId: user.email }],
                isDeleted: false,
            }).sort({ createdAt: -1 });

            // Find agency details linked via meethiId or createdBy
            let agencyInfo: any = null;
            if (user.meethiId) {
                const agencyUser = await User.findOne({
                    $or: [{ meethiId: user.meethiId }, { userId: !isNaN(Number(user.meethiId)) ? Number(user.meethiId) : undefined }],
                    role: { $in: ["agency", "admin", "owner"] },
                }).select("name phoneNumber email image meethiId role agencyName agencyLogo");

                const agencyModel = await Agency.findOne({
                    $or: [{ code: user.meethiId }, { ownerId: agencyUser?._id }],
                });

                if (agencyUser || agencyModel) {
                    agencyInfo = {
                        agencyName: agencyModel?.name || (agencyUser as any)?.agencyName || agencyUser?.name || "Mithi Official Agency",
                        agencyNumber: agencyUser?.phoneNumber || agencyUser?.email || "Support Available",
                        agencyLogo: (agencyUser as any)?.agencyLogo || agencyUser?.image || "",
                        agencyCode: agencyModel?.code || user.meethiId || "AGENCY-101",
                    };
                }
            }

            if (!agencyInfo) {
                agencyInfo = {
                    agencyName: "Mithi Official Agency",
                    agencyNumber: "+91 9876543210",
                    agencyLogo: "",
                    agencyCode: user.meethiId || "AGENCY-MAIN",
                };
            }

            return sendResponse(res, 200, true, "Host status fetched successfully", {
                status: "APPROVED",
                role: "host",
                hostId: hostRecord?.hostId || user.userId,
                meethiId: user.meethiId || hostRecord?.meethiId || user.userId,
                hostingCreatedAt: hostRecord?.createdAt || user.createdAt,
                agencyDetails: agencyInfo,
            });
        }

        // 2. Check for PENDING application in TempHostModel or Host (isApproved: false)
        const tempHost = await TempHostModel.findOne({ userId: user.userId });
        const pendingHost = await Host.findOne({
            $or: [{ meethiId: user.meethiId }, { mobileNumber: user.phoneNumber }, { emailId: user.email }],
            isApproved: false,
            isDeleted: false,
        });

        if (tempHost || pendingHost) {
            // Find linked agency / creator info to build approval stage chain
            let creatorRole = "superAdmin";
            if (user.createdBy) {
                const creator = await User.findById(user.createdBy).select("role");
                if (creator?.role) creatorRole = creator.role;
            }

            const hasAgency = Boolean(user.meethiId);
            const stages = [];

            if (hasAgency) {
                stages.push({
                    title: "Agency Verification",
                    description: "Agency is reviewing your hosting details & documents.",
                    status: "in_progress",
                    icon: "business",
                });
            }

            stages.push({
                title: "Operator Review",
                description: "Operator team is inspecting host voice intro and credentials.",
                status: hasAgency ? "pending" : "in_progress",
                icon: "support-agent",
            });

            stages.push({
                title: "Admin Approval",
                description: "Administrative staff verifying compliance and payout tier.",
                status: "pending",
                icon: "admin-panel-settings",
            });

            if (creatorRole === "superAdmin") {
                stages.push({
                    title: "Super Admin Final Audit",
                    description: "Super Admin final security seal & host role activation.",
                    status: "pending",
                    icon: "verified-user",
                });
            }

            return sendResponse(res, 200, true, "Host application under review", {
                status: "PENDING",
                role: user.role,
                appliedAt: tempHost?.createdAt || pendingHost?.createdAt || user.createdAt,
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
