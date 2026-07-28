import axios from "axios";
import { config } from "../configs/envConfig";
import { generateOtp } from "./otp";
import PhoneOtpModel from "../models/phoneOtp.model";

const SMS_REQUEST_TIMEOUT_MS = 7000;

const normalizePhoneNumber = (phoneNumber: string): { storageKey: string; mobile: string } => {
  const digits = String(phoneNumber || "").replace(/\D/g, "");
  const mobile = digits.slice(-10);

  if (mobile.length !== 10) {
    throw new Error("Please enter a valid 10-digit mobile number.");
  }

  return {
    storageKey: digits.length === 10 ? `+91${mobile}` : `+${digits}`,
    mobile,
  };
};

/**
 * Sends one OTP through the server SMS provider. The app intentionally does
 * not use Firebase phone auth, so Android never opens a reCAPTCHA browser and
 * verification is not tied to a short-lived Firebase confirmation session.
 */
export const sendPhoneOtp = async (
  phoneNumber: string
): Promise<{ success: boolean; message: string }> => {
  let storageKey = "";
  let otp = "";

  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    storageKey = normalized.storageKey;
    otp = generateOtp(6);

    if (!config.FAST2SMS_API_KEY) {
      console.error("[sendPhoneOtp] FAST2SMS_API_KEY is not configured");
      return { success: false, message: "SMS service is temporarily unavailable. Please try again later." };
    }

    // One atomic write avoids the delete/create gap that could produce a
    // missing or stale OTP when two resend requests overlap.
    await PhoneOtpModel.findOneAndUpdate(
      { phoneNumber: storageKey },
      {
        $set: {
          otp,
          attempts: 0,
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const response = await axios.get("https://www.fast2sms.com/dev/bulkV2", {
      params: {
        authorization: config.FAST2SMS_API_KEY,
        route: "otp",
        variables_values: otp,
        flash: "0",
        numbers: normalized.mobile,
      },
      timeout: SMS_REQUEST_TIMEOUT_MS,
    });

    if (response.data?.return === true) {
      console.log(`[sendPhoneOtp] SMS provider accepted OTP for ${normalized.mobile}`);
      return { success: true, message: "OTP sent successfully" };
    }

    console.error("[sendPhoneOtp] SMS provider rejected request:", response.data);
    await PhoneOtpModel.deleteOne({ phoneNumber: storageKey, otp });
    return { success: false, message: "SMS provider could not send the OTP. Please try again." };
  } catch (error: any) {
    console.error("[sendPhoneOtp] Exception:", error?.message);

    // Do not leave a verifiable OTP behind when the SMS was not accepted.
    if (storageKey && otp) {
      await PhoneOtpModel.deleteOne({ phoneNumber: storageKey, otp }).catch(() => undefined);
    }

    const timedOut = error?.code === "ECONNABORTED";
    return {
      success: false,
      message: timedOut
        ? "SMS service took too long to respond. Please try again."
        : error?.message || "Unable to send OTP. Please try again.",
    };
  }
};

/** Verifies a single-use OTP. Records expire automatically after 10 minutes. */
export const verifyPhoneOtp = async (
  phoneNumber: string,
  otp: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const { storageKey } = normalizePhoneNumber(phoneNumber);
    const enteredOtp = String(otp || "").trim();

    // A test code must be explicitly configured and is never enabled in production.
    const testCode = process.env.NODE_ENV !== "production" ? process.env.OTP_TEST_CODE : undefined;
    if (testCode && enteredOtp === testCode) {
      await PhoneOtpModel.deleteOne({ phoneNumber: storageKey });
      return { success: true, message: "OTP verified successfully" };
    }

    const record = await PhoneOtpModel.findOne({ phoneNumber: storageKey });
    if (!record) {
      return { success: false, message: "OTP expired or not found. Please request a new OTP." };
    }

    record.attempts += 1;
    await record.save();

    if (record.attempts > 5) {
      await PhoneOtpModel.deleteOne({ phoneNumber: storageKey });
      return { success: false, message: "Too many attempts. Please request a new OTP." };
    }

    if (record.otp !== enteredOtp) {
      return { success: false, message: "Invalid OTP. Please try again." };
    }

    await PhoneOtpModel.deleteOne({ phoneNumber: storageKey });
    return { success: true, message: "OTP verified successfully" };
  } catch (error: any) {
    console.error("[verifyPhoneOtp] Exception:", error?.message);
    return { success: false, message: error?.message || "Verification failed. Please try again." };
  }
};
