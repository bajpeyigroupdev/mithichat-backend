
import { Response } from "express";
import { AuthRequest } from "../middlewares/authorize.middleware";
import sendResponse from "../utils/reponse";
import { Kyc, KycStatus } from "../models/kyc.model";
import { User } from "../models/user.model";
import { Logger } from "../utils/logger";
import { deleteImageFromCloudinary } from "../utils/cloudinary";
import { HierarchyScopeService } from "../utils/hierarchyScope";

const KYC_ADMIN_ROLES = new Set(["owner", "operator", "superAdmin", "admin", "agency"]);

// Create or Update KYC
export const submitKyc = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.user || {};
        const { panNumber, aadharNumber, panImage, aadharFrontImage, aadharBackImage } = req.body;

        if (!panImage || !aadharFrontImage || !aadharBackImage) {
            return sendResponse(res, 400, false, "All identity card images (URL) are required (Pan, Aadhar Front/Back)");
        }

        if (!panNumber || !aadharNumber) {
            return sendResponse(res, 400, false, "Pan and Aadhar numbers are required");
        }

        const existingKyc = await Kyc.findOne({ userId });

        if (existingKyc) {
            if (existingKyc.status === KycStatus.APPROVED) {
                return sendResponse(res, 400, false, "KYC already approved");
            }
            // Update existing
            existingKyc.panNumber = panNumber;
            existingKyc.aadharNumber = aadharNumber;
            existingKyc.panImage = panImage;
            existingKyc.aadharFrontImage = aadharFrontImage;
            existingKyc.aadharBackImage = aadharBackImage;
            existingKyc.status = KycStatus.PENDING;
            await existingKyc.save();
        } else {
            // Create new
            await Kyc.create({
                userId,
                panNumber,
                aadharNumber,
                panImage,
                aadharFrontImage,
                aadharBackImage,
                status: KycStatus.PENDING
            });
        }

        return sendResponse(res, 200, true, "KYC submitted successfully. Please wait for admin approval.");

    } catch (error: any) {
        // Cleanup potential uploads
        const { panImage, aadharFrontImage, aadharBackImage } = req.body;
        if (panImage) await deleteImageFromCloudinary(panImage);
        if (aadharFrontImage) await deleteImageFromCloudinary(aadharFrontImage);
        if (aadharBackImage) await deleteImageFromCloudinary(aadharBackImage);

        await Logger("submitKyc", error);
        return sendResponse(res, 500, false, error.message);
    }
};

// Get My KYC Status
export const getMyKyc = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.user || {};
        const kyc = await Kyc.findOne({ userId });
        if (!kyc) {
            return sendResponse(res, 404, false, "KYC not found");
        }
        return sendResponse(res, 200, true, "KYC fetched", kyc);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}

// Admin: Get Pending KYC
export const getPendingKyc = async (req: AuthRequest, res: Response) => {
    try {
        const { role, id } = req.user || {};
        if (!role || !id || !KYC_ADMIN_ROLES.has(role)) {
            return sendResponse(res, 403, false, "You are not allowed to view KYC requests");
        }

        const filter: any = { status: KycStatus.PENDING };
        if (!["owner", "operator"].includes(role)) {
            const userScope = HierarchyScopeService.buildUserScope({ id: String(id), role });
            const visibleUsers = await User.find(userScope).select("userId").lean();
            filter.userId = { $in: visibleUsers.map((user) => user.userId) };
        }

        const list = await Kyc.find(filter).sort({ createdAt: -1 });
        const users = await User.find({
            userId: { $in: list.map((item) => item.userId) },
        }).select("userId name userName image meethiId role").lean();
        const userById = new Map(users.map((user) => [user.userId, user]));
        const enriched = list.map((item) => ({
            ...item.toObject(),
            user: userById.get(item.userId) || null,
        }));

        return sendResponse(res, 200, true, "Pending KYC list", enriched);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}

// Admin: Approve/Reject KYC
export const updateKycStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { role, id } = req.user || {};
        if (!role || !id || !KYC_ADMIN_ROLES.has(role)) {
            return sendResponse(res, 403, false, "You are not allowed to review KYC");
        }
        const { kycId, status, reason } = req.body;
        if (![KycStatus.APPROVED, KycStatus.REJECTED].includes(status)) {
            return sendResponse(res, 400, false, "Invalid status");
        }

        const kyc = await Kyc.findById(kycId);
        if (!kyc) {
            return sendResponse(res, 404, false, "KYC record not found");
        }

        if (!["owner", "operator"].includes(role)) {
            const userScope = HierarchyScopeService.buildUserScope({ id: String(id), role });
            const visibleUser = await User.exists({
                $and: [userScope, { userId: kyc.userId }],
            });
            if (!visibleUser) {
                return sendResponse(res, 403, false, "This KYC is outside your team");
            }
        }

        kyc.status = status;
        if (status === KycStatus.REJECTED) {
            kyc.rejectionReason = reason || "Documents invalid";
        } else {
            kyc.rejectionReason = undefined;
        }
        await kyc.save();

        return sendResponse(res, 200, true, `KYC ${status} successfully`);

    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}
