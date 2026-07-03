import { Request, Response } from "express";
import sendResponse from "../utils/reponse";
import { AuthRequest } from "../middlewares/authorize.middleware";
import { Logger } from "../utils/logger";
import axios from "axios";
import { config } from "../configs/envConfig";

export const verifyUpi = async (req: AuthRequest, res: Response) => {
    try {
        const { upiId } = req.body;

        if (!upiId) {
            return sendResponse(res, 400, false, "UPI ID is required");
        }

        // Basic Regex verification for UPI ID format
        const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

        if (!upiRegex.test(upiId)) {
            return sendResponse(res, 400, false, "Invalid UPI ID format. Example: yourname@upi");
        }

        // Razorpay Validate VPA API
        // Docs: https://razorpay.com/docs/api/payments/third-party-validation/#validate-vpa
        const keyId = config.RAZORPAY_KEY_ID;
        const keySecret = config.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            // Fallback: if Razorpay keys aren't set, do regex-only validation
            return sendResponse(res, 200, true, "UPI ID format is valid (gateway verification unavailable)", {
                upiId,
                name: upiId.split('@')[0],
                verified: false,
            });
        }

        try {
            const response = await axios.post(
                'https://api.razorpay.com/v1/payments/validate/vpa',
                { vpa: upiId },
                {
                    auth: {
                        username: keyId,
                        password: keySecret,
                    },
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                }
            );

            const data = response.data;

            if (data.success) {
                return sendResponse(res, 200, true, "UPI ID Verified successfully", {
                    upiId,
                    name: data.customer_name || "UPI Account Holder",
                    vpa: data.vpa,
                    verified: true,
                });
            } else {
                return sendResponse(res, 400, false, "UPI ID verification failed. Invalid VPA.", {
                    upiId,
                    verified: false,
                });
            }
        } catch (razorpayError: any) {
            // Razorpay returns 400 for invalid VPA
            if (razorpayError.response?.status === 400) {
                const errorData = razorpayError.response.data;
                return sendResponse(res, 400, false, errorData?.error?.description || "Invalid UPI ID", {
                    upiId,
                    verified: false,
                });
            }

            // If Razorpay API is down or unreachable, fallback to format-only validation
            console.error("Razorpay VPA Validation Error:", razorpayError.message);
            return sendResponse(res, 200, true, "UPI ID format is valid (could not verify with bank)", {
                upiId,
                name: upiId.split('@')[0],
                verified: false,
            });
        }

    } catch (error: any) {
        await Logger("verifyUpi", error);
        return sendResponse(res, 500, false, error.message);
    }
};
