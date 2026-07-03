
import { Response } from "express";
import { AuthRequest } from "../middlewares/authorize.middleware";
import sendResponse from "../utils/reponse";
import { Kyc, KycStatus } from "../models/kyc.model";
import { User } from "../models/user.model";
import { Logger } from "../utils/logger";
import { deleteImageFromCloudinary } from "../utils/cloudinary";

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
        const list = await Kyc.find({ status: KycStatus.PENDING }).sort({ createdAt: -1 });
        return sendResponse(res, 200, true, "Pending KYC list", list);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}

// Admin: Approve/Reject KYC
export const updateKycStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { kycId, status, reason } = req.body;
        if (![KycStatus.APPROVED, KycStatus.REJECTED].includes(status)) {
            return sendResponse(res, 400, false, "Invalid status");
        }

        const kyc = await Kyc.findById(kycId);
        if (!kyc) {
            return sendResponse(res, 404, false, "KYC record not found");
        }

        kyc.status = status;
        if (status === KycStatus.REJECTED) {
            kyc.rejectionReason = reason || "Documents invalid";
        }
        await kyc.save();

        return sendResponse(res, 200, true, `KYC ${status} successfully`);

    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}
