import axios from "axios";
import { config } from "../configs/envConfig";
import { generateOtp } from "./otp";
import PhoneOtpModel from "../models/phoneOtp.model";

/**
 * Sends an OTP SMS to the given phone number via Fast2SMS.
 * Strips the country code if present (Fast2SMS accepts 10-digit Indian numbers).
 */
export const sendPhoneOtp = async (phoneNumber: string): Promise<{ success: boolean; message: string }> => {
  try {
    const otp = generateOtp(6);

    // Normalize phone: strip leading + and country code (e.g. +91 -> 10 digits)
    const digits = phoneNumber.replace(/\D/g, "");
    const mobile = digits.length > 10 ? digits.slice(-10) : digits;

    // Save OTP to DB (upsert so resend overwrites old one)
    await PhoneOtpModel.findOneAndDelete({ phoneNumber });
    await PhoneOtpModel.create({ phoneNumber, otp });

    const message = `Your MithiChat OTP is ${otp}. Valid for 10 minutes. Do not share with anyone.`;

    const response = await axios.get("https://www.fast2sms.com/dev/bulkV2", {
      params: {
        authorization: config.FAST2SMS_API_KEY,
        message,
        language: "english",
        route: "q",   // Transactional (quick) route
        numbers: mobile,
      },
      timeout: 10000,
    });

    if (response.data?.return === true) {
      return { success: true, message: "OTP sent successfully" };
    }

    console.error("[sendPhoneOtp] Fast2SMS error:", response.data);
    return { success: false, message: response.data?.message?.[0] || "Failed to send OTP" };
  } catch (error: any) {
    console.error("[sendPhoneOtp] Exception:", error?.message);
    return { success: false, message: "Unable to send OTP. Please try again." };
  }
};

/**
 * Verifies the OTP for a given phone number.
 */
export const verifyPhoneOtp = async (
  phoneNumber: string,
  otp: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const record = await PhoneOtpModel.findOne({ phoneNumber });

    if (!record) {
      return { success: false, message: "OTP expired or not found. Please request a new OTP." };
    }

    // Increment attempt counter
    record.attempts += 1;
    await record.save();

    if (record.attempts > 5) {
      await PhoneOtpModel.deleteOne({ phoneNumber });
      return { success: false, message: "Too many attempts. Please request a new OTP." };
    }

    if (record.otp !== otp.trim()) {
      return { success: false, message: "Invalid OTP. Please try again." };
    }

    // OTP matched — delete it so it can't be reused
    await PhoneOtpModel.deleteOne({ phoneNumber });
    return { success: true, message: "OTP verified successfully" };
  } catch (error: any) {
    console.error("[verifyPhoneOtp] Exception:", error?.message);
    return { success: false, message: "Verification failed. Please try again." };
  }
};
