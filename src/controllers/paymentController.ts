
import { Response } from "express";
import { AuthRequest } from "../middlewares/authorize.middleware";
import sendResponse from "../utils/reponse";
import { User } from "../models/user.model";
import { RechargeHistory } from "../models/RechargeHistory";
import { RechargeType } from "../constants/user";
import { Logger } from "../utils/logger";
import { google } from "googleapis";
import path from "path";

// Initialize Google Auth Client
const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(__dirname, "../../configs/google-services.json"),
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
});

const androidPublisher = google.androidpublisher({
    version: 'v3',
    auth: auth
});

const verifyGoogleReceipt = async (purchaseToken: string, productId: string, packageName: string) => {
    try {
        const res = await androidPublisher.purchases.products.get({
            packageName: packageName,
            productId: productId,
            token: purchaseToken,
        });

        // consumptionState: 0 = Yet to be consumed, 1 = Consumed
        // purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending
        if (res.data.purchaseState === 0) {
            return true;
        }
        return false;
    } catch (error) {
        console.error("Google Verification Failed:", error);
        return false;
    }
};

export const verifyGooglePurchase = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.user || {};
        const { purchaseToken, productId, diamonds, packageName } = req.body;

        const effectivePackageName = packageName || "com.umang.app"; // Fallback or env var

        if (!userId || !purchaseToken || !productId || !diamonds) {
            return sendResponse(res, 400, false, "Missing required fields");
        }

        // 1. Verify Receipt with Google (REAL)
        const isValid = await verifyGoogleReceipt(purchaseToken, productId, effectivePackageName);
        if (!isValid) {
            return sendResponse(res, 400, false, "Invalid or Canceled Purchase");
        }

        // 2. Check for Duplicate Transaction
        // Prevent replay attacks by checking if this token was already used
        const existingTransaction = await RechargeHistory.findOne({ transactionId: purchaseToken }); // Using token as unique ID
        if (existingTransaction) {
            return sendResponse(res, 409, false, "Transaction already processed");
        }

        // 3. Update User Balance
        const user = await User.findOne({ userId });
        if (!user) {
            return sendResponse(res, 404, false, "User not found");
        }

        user.diamonds = (user.diamonds || 0) + Number(diamonds);
        await user.save();

        // 4. Create History Record
        await RechargeHistory.create({
            userId,
            type: RechargeType.GOOGLE_PLAY,
            coins: Number(diamonds), // legacy history column; represents purchased diamonds
            date: new Date(),
            sellerId: undefined,
            transactionId: purchaseToken, // Store token to prevent duplicates
        });

        return sendResponse(res, 200, true, "Purchase verified and diamonds added", {
            newBalance: user.diamonds
        });

    } catch (error: any) {
        await Logger("verifyGooglePurchase", error);
        return sendResponse(res, 500, false, error.message);
    }
};
