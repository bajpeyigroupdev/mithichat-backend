import express from "express";

import { validationCheckUser, validationGoogleAuth, validationUserCreate, validationUserLogin, validationResetPassword } from "../validations/auth.validator";
import { requestValidator } from "../middlewares/validation.middleware";
import { verifyToken } from "../middlewares/authorize.middleware";
import { checkPhoneAvailability, userGoogleAuth, userLogin, userLogout, userRefreshToken, userRegister, linkAccount, resetPassword, forgotPassword, sendOtpToPhone, verifyOtpFromPhone } from "../controllers/authController";


const router = express.Router();

// Define routes properly
router.post("/user-phone-check", validationCheckUser, requestValidator, checkPhoneAvailability);
router.post("/user-signup", validationUserCreate, requestValidator, userRegister);
router.post("/userphone-login", validationUserLogin, requestValidator, userLogin);
router.post("/user-logout", verifyToken, userLogout);
router.post("/user-google-auth", validationGoogleAuth, requestValidator, userGoogleAuth)
router.post("/refresh-token", userRefreshToken);
router.post("/reset-password", validationResetPassword, requestValidator, resetPassword);
router.post("/forgot-password", forgotPassword);

// ✅ Custom server-side phone OTP (replaces Firebase phone auth)
router.post("/send-phone-otp", sendOtpToPhone);
router.post("/verify-phone-otp", verifyOtpFromPhone);

router.post("/link-account", verifyToken, linkAccount);

export default router;
