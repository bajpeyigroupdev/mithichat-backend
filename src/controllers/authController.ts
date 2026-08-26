import { Request, Response, NextFunction } from "express";
import admin from 'firebase-admin';
import sendResponse from "../utils/reponse";
import jwt from "jsonwebtoken";
import { AuthRequest } from "../middlewares/authorize.middleware";
import { User } from "../models/user.model";
import { config } from "../configs/envConfig";
import { generateRandomName, generateToken, generateUniqueId } from "../utils/generator";
import { OAuth2Client } from 'google-auth-library';
import { Logger } from "../utils/logger";
import { generateSecureHash, verifySecureHash } from "../utils/passwordHelper";
import { verifyFirebasePhoneToken } from "../utils/firebasePhoneVerification";
import { APP_ACCOUNT_ROLES } from "../utils/accountScope";
import { DeviceLimit } from "../models/deviceLimit.model";
import { getCachedSettings } from "./settingsController";

// ==================== RESET PASSWORD ====================
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { phoneNumber, newPassword, firebaseIdToken } = req.body;

    if (!phoneNumber || !newPassword || !firebaseIdToken) {
      return sendResponse(res, 400, false, "Phone number, new password and Firebase verification are required");
    }

    const firebaseVerification = await verifyFirebasePhoneToken(firebaseIdToken, phoneNumber);
    if (!firebaseVerification.success) {
      return sendResponse(res, 401, false, firebaseVerification.message);
    }

    const user = await User.findOne({ phoneNumber, role: { $in: APP_ACCOUNT_ROLES }, isDeleted: false });
    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }

    if (user.isBlocked) {
      return sendResponse(res, 403, false, "Your account is currently blocked.");
    }

    const hashedPassword = await generateSecureHash(newPassword);
    user.password = hashedPassword;
    await user.save();

    return sendResponse(res, 200, true, "Password reset successfully");
  } catch (error: any) {
    console.error("resetPassword error:", error?.message);
    return sendResponse(
      res,
      500,
      false,
      error?.message || "Internal Server Error"
    );
  }
};

// ==================== FORGOT PASSWORD ====================
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const rawPhone = req.body?.phoneNumber;

    if (!rawPhone) {
      return sendResponse(res, 400, false, "Phone number is required");
    }

    const phoneNumber = String(rawPhone).trim().replace(/\s+/g, "");
    const digitsOnly = phoneNumber.replace(/\D/g, "");
    const tenDigits = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
    const phoneRegex = new RegExp(`${tenDigits}$`);

    console.log(`[forgotPassword] Looking up phone: "${phoneNumber}" (last 10: "${tenDigits}")`);

    const user = await User.findOne({
      $or: [
        { phoneNumber },
        { phoneNumber: { $regex: phoneRegex } },
      ],
      role: { $in: APP_ACCOUNT_ROLES },
      $and: [
        { $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }] }
      ]
    });

    console.log(`[forgotPassword] User found: ${user ? `userId=${user.userId}` : "NOT FOUND"}`);

    if (!user) {
      return sendResponse(res, 404, false, "No account found with this phone number. Please check and try again.");
    }

    if (user.isBlocked) {
      return sendResponse(res, 403, false, "Your account is currently blocked. Please contact support.");
    }

    return sendResponse(res, 200, true, "Phone number is eligible for Firebase verification.");
  } catch (error: any) {
    await Logger("forgotPassword", error);
    return sendResponse(res, 500, false, error.message || "Internal Server Error");
  }
};

// ==================== CHECK PHONE AVAILABILITY ====================
export const checkPhoneAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phone = req.body?.phoneNumber?.trim();
    const deviceId = req.body?.deviceId?.trim();

    if (!phone) return sendResponse(res, 400, false, "Phone number is required.");
    if (!deviceId) return sendResponse(res, 400, false, "Device ID is required.");

    const existingUser = await User.findOne({ phoneNumber: phone, role: { $in: APP_ACCOUNT_ROLES }, isDeleted: false }).lean();

    if (existingUser) {
      if (existingUser.isBlocked) {
        return sendResponse(res, 403, false, "Your account is currently blocked.");
      }

      return sendResponse(res, 400, false, "Phone number already registered.");
    }

    return sendResponse(res, 200, true, "New device & phone. Send OTP for registration.");
  } catch (err) {
    await Logger("checkPhoneAvailability", err);
    return sendResponse(res, 500, false, "Something went wrong while verifying the phone number.");
  }
};

// ==================== REGISTER ====================
export const userRegister = async (req: AuthRequest, res: Response) => {
  try {
    const { phoneNumber, password, gender, deviceId, userFrom, language, country, age, firebaseIdToken } = req.body;

    if (!phoneNumber || !password || !gender || !firebaseIdToken) {
      return sendResponse(res, 400, false, "Phone number, password, gender and Firebase verification are required");
    }

    const firebaseVerification = await verifyFirebasePhoneToken(firebaseIdToken, phoneNumber);
    if (!firebaseVerification.success) {
      return sendResponse(res, 401, false, firebaseVerification.message);
    }

    const duplicatePhoneUser = await User.findOne({ phoneNumber, role: { $in: APP_ACCOUNT_ROLES }, isDeleted: false });
    if (duplicatePhoneUser) {
      return sendResponse(res, 400, false, "Phone number already registered");
    }

    if (userFrom === "app") {
      if (!deviceId) {
        return sendResponse(res, 400, false, "deviceId is required for app users");
      }

      // Check max account creation limit for this device (default 1)
      const customLimit = await DeviceLimit.findOne({ deviceId });
      const settings = await getCachedSettings();
      const maxAllowed = customLimit ? customLimit.maxAllowedAccounts : (settings?.defaultMaxAccountsPerDevice || 1);

      const existingDeviceAccounts = await User.countDocuments({
        "device.createdDeviceId": deviceId,
        role: { $in: APP_ACCOUNT_ROLES },
        isDeleted: false,
      });

      if (existingDeviceAccounts >= maxAllowed) {
        return sendResponse(
          res,
          400,
          false,
          `Registration limit reached for this device (Max allowed: ${maxAllowed}). Contact support to allow more accounts.`
        );
      }
    }

    const requestedUserId = req.body?.customUserId || req.body?.userId;
    const userId = requestedUserId ? Number(requestedUserId) : await generateUniqueId();
    const customMeethiId = req.body?.meethiId || req.body?.customId || String(userId);

    const name = await generateRandomName();
    const hashedPassword = await generateSecureHash(password);
    let image = "";
    switch (gender) {
      case "male": {
        image = "https://api.mithichat.live/uploads/avatars/205766/77c96d4c-7224-4e7f-893a-542e9727d232.jpg";
        break;
      }
      case "female": {
        image = "https://api.mithichat.live/uploads/avatars/582737/83f0beef-e50a-4ab4-9302-1665a62a9dae.jpg";
        break;
      }
      default: {
        image = "";
      }
    }

    const countryObj = (typeof country === 'object' && country !== null)
      ? country
      : { name: typeof country === 'string' ? country : '', code: '', flag: '' };

    const newUser = new User({
      phoneNumber,
      password: hashedPassword,
      gender,
      userId,
      meethiId: customMeethiId,
      phoneVerified: true,
      name,
      image,
      language,
      country: countryObj,
      authType: "phone",
      age: Number(age) || 18,
      device: {
        createdDeviceId: deviceId || "",
        currentDeviceId: deviceId || "",
        loggedInDeviceIds: deviceId ? [deviceId] : [],
      },
    });

    await newUser.save();

    const accessToken = await generateToken(newUser.userId.toString(), "access");
    const refreshToken = await generateToken(newUser.userId.toString(), "refresh");

    newUser.refreshToken = refreshToken;
    await newUser.save();

    return sendResponse(res, 201, true, "Registration successful", {
      accessToken,
      refreshToken,
      role: newUser.role,
      gender: newUser.gender
    });
  } catch (error: any) {
    await Logger("userRegister", error);
    return sendResponse(res, 500, false, error.message);
  }
};

// ==================== LOGIN ====================
export const userLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneNumber, userId, password, deviceId, userFrom } = req.body;

    const rawInput = (phoneNumber || userId || "").toString().trim();
    const cleanDigits = rawInput.replace(/\D/g, "");
    const last10Digits = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

    const findConditions: any[] = [];
    if (rawInput) {
      findConditions.push({ phoneNumber: rawInput });
      findConditions.push({ email: rawInput.toLowerCase() });
      findConditions.push({ meethiId: rawInput });
      findConditions.push({ userName: rawInput });
      if (!isNaN(Number(rawInput))) {
        findConditions.push({ userId: Number(rawInput) });
      }
    }
    if (last10Digits && last10Digits.length >= 7) {
      findConditions.push({ phoneNumber: new RegExp(`${last10Digits}$`) });
      if (!isNaN(Number(last10Digits))) {
        findConditions.push({ userId: Number(last10Digits) });
      }
    }

    if (findConditions.length === 0) {
      return sendResponse(res, 400, false, "Phone number or User ID is required.");
    }

    const user = await User.findOne({
      $or: findConditions,
      role: { $ne: 'owner' },
      isDeleted: false
    }).select("+password");

    if (!user) {
      return sendResponse(res, 400, false, "Account not found, please sign up.");
    }

    if (user.isBlocked) {
      return sendResponse(res, 403, false, "You are blocked due to some reason.");
    }

    if (userFrom === "app") {
      const activeDeviceId = deviceId || "APP_DEFAULT_DEVICE";

      user.device = user.device || {
        createdDeviceId: activeDeviceId,
        currentDeviceId: activeDeviceId,
        loggedInDeviceIds: [activeDeviceId],
      };

      user.device.currentDeviceId = activeDeviceId;
      if (!user.device.loggedInDeviceIds.includes(activeDeviceId)) {
        user.device.loggedInDeviceIds.push(activeDeviceId);
      }

      await user.save();
    }

    const isMatch = await verifySecureHash(password, user.password as string);
    if (!isMatch) {
      return sendResponse(res, 400, false, "Invalid credentials.");
    }

    const accessToken = await generateToken(user.userId.toString(), "access");
    const refreshToken = await generateToken(user.userId.toString(), "refresh");

    user.refreshToken = refreshToken;
    user.activeToken = accessToken;
    await user.save();

    return sendResponse(res, 200, true, "Login successful", {
      accessToken,
      refreshToken,
      role: user.role,
      gender: user.gender
    });
  } catch (error: any) {
    await Logger("login", error);
    return sendResponse(res, 500, false, error.message);
  }
};

// ==================== LOGOUT ====================
export const userLogout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.user || {};
    const { deviceId, userFrom } = req.body;

    const user = await User.findOne({ userId, isDeleted: false });
    if (!user) {
      return sendResponse(res, 400, false, "User not found.");
    }

    if (userFrom === "app") {
      if (!deviceId) {
        return sendResponse(res, 400, false, "deviceId is required for app users.");
      }

      user.device = user.device || {
        createdDeviceId: "",
        currentDeviceId: "",
        loggedInDeviceIds: [],
      };

      const isLoggedInFromDevice = user.device.loggedInDeviceIds.includes(deviceId);
      if (!isLoggedInFromDevice) {
        return sendResponse(res, 400, false, "This device is not currently logged in.");
      }

      user.device.loggedInDeviceIds = user.device.loggedInDeviceIds.filter(
        (id) => id !== deviceId
      );

      if (user.device.currentDeviceId === deviceId) {
        user.device.currentDeviceId = "";
      }

      await user.save();
    }

    user.isOnline = false;
    user.isActive = false;
    user.isBusy = false;
    user.fcmToken = "";
    user.refreshToken = "";
    user.activeToken = "";
    await user.save();

    try {
      const { invalidateHostCache } = await import('../services/user.service');
      invalidateHostCache();
    } catch (err) {
      console.warn('Failed to invalidate host cache on logout:', err?.message);
    }

    return sendResponse(res, 200, true, "Logout successful.");
  } catch (error: any) {
    await Logger("logout", error);
    return sendResponse(res, 500, false, error.message);
  }
};

// ==================== GOOGLE AUTH ====================
export const userGoogleAuth = async (req: Request, res: Response) => {
  const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

  try {
    const { googleIdToken, deviceId, userFrom, gender, language, country, age } = req.body;

    if (!googleIdToken) return sendResponse(res, 400, false, "Google token required");

    const ticket = await client.verifyIdToken({
      idToken: googleIdToken,
      audience: config.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) return sendResponse(res, 400, false, "Invalid credentials");

    const googleUserInfo = {
      email: payload.email,
      name: payload.name,
      googleId: payload.sub,
    };

    let user = await User.findOne({ googleId: googleUserInfo.googleId, role: { $in: APP_ACCOUNT_ROLES }, isDeleted: false });

    if (user) {
      if (userFrom === "app") {
        user.device = user.device || { createdDeviceId: "", currentDeviceId: "", loggedInDeviceIds: [] };
        if (!user.device.createdDeviceId) user.device.createdDeviceId = deviceId || '';
        if (deviceId && !user.device.loggedInDeviceIds.includes(deviceId)) user.device.loggedInDeviceIds.push(deviceId);
        user.device.currentDeviceId = deviceId || user.device.currentDeviceId;
        await user.save();
      }

      const accessToken = await generateToken(user.userId.toString(), "access");
      const refreshToken = await generateToken(user.userId.toString(), "refresh");
      user.refreshToken = refreshToken;
      user.activeToken = accessToken;
      await user.save();

      return sendResponse(res, 200, true, "Google login successful", {
        accessToken,
        refreshToken,
        role: user.role,
        gender: user.gender,
        isAccount: true,
      });
    }

    const userCountry = (typeof country === 'string' ? { name: country } : country) || { name: 'India', code: '+91', flag: '🇮🇳' };
    if (!gender || !Array.isArray(language) || language.length < 2 || !userCountry?.name) {
      return sendResponse(res, 428, false, "Complete gender, country and 2 languages to create your account");
    }

    const existingEmailUser = await User.findOne({ email: googleUserInfo.email, role: { $in: APP_ACCOUNT_ROLES }, isDeleted: false });
    if (existingEmailUser) {
      if (!payload.email_verified) {
        return sendResponse(res, 403, false, "Google email must be verified");
      }
      existingEmailUser.googleId = googleUserInfo.googleId;
      existingEmailUser.device = existingEmailUser.device || { createdDeviceId: "", currentDeviceId: "", loggedInDeviceIds: [] };
      if (!existingEmailUser.device.createdDeviceId) existingEmailUser.device.createdDeviceId = deviceId || '';
      if (deviceId && !existingEmailUser.device.loggedInDeviceIds.includes(deviceId)) {
        existingEmailUser.device.loggedInDeviceIds.push(deviceId);
      }
      existingEmailUser.device.currentDeviceId = deviceId || existingEmailUser.device.currentDeviceId;
      const accessToken = await generateToken(existingEmailUser.userId.toString(), "access");
      const refreshToken = await generateToken(existingEmailUser.userId.toString(), "refresh");
      existingEmailUser.refreshToken = refreshToken;
      await existingEmailUser.save();
      return sendResponse(res, 200, true, "Google account linked successfully", {
        accessToken,
        refreshToken,
        role: existingEmailUser.role,
        gender: existingEmailUser.gender,
        isAccount: true,
      });
    }

    let image;
    switch (gender) {
      case "male": {
        image = "https://api.mithichat.live/uploads/avatars/205766/77c96d4c-7224-4e7f-893a-542e9727d232.jpg";
        break;
      }
      case "female": {
        image = "https://api.mithichat.live/uploads/avatars/582737/83f0beef-e50a-4ab4-9302-1665a62a9dae.jpg";
        break;
      }
      default: {
        image = "";
      }
    }

    const userId = await generateUniqueId();
    const newUser = new User({
      userId,
      name: googleUserInfo.name,
      email: googleUserInfo.email,
      googleId: googleUserInfo.googleId,
      gender,
      image,
      authType: "google",
      emailVerified: payload.email_verified || false,
      language,
      country: userCountry,
      age: Number(age) || 18,
      device: userFrom === "app" ? { createdDeviceId: deviceId || "", currentDeviceId: deviceId || "", loggedInDeviceIds: deviceId ? [deviceId] : [] } : {},
    });

    const accessToken = await generateToken(newUser.userId.toString(), "access");
    const refreshToken = await generateToken(newUser.userId.toString(), "refresh");
    newUser.refreshToken = refreshToken;
    newUser.activeToken = accessToken;
    const userCreated = await newUser.save();

    return sendResponse(res, 201, true, "Google signup successful", { accessToken, refreshToken, role: userCreated.role, gender: userCreated.gender });

  } catch (error: any) {
    if (error.message && error.message.includes("Wrong recipient")) {
      console.error(`[GOOGLE AUTH DEBUG] Audience mismatch. Backend expected: ${config.GOOGLE_CLIENT_ID}`);
    }
    await Logger("googleAuth", error);
    return sendResponse(res, 500, false, error.message || "Internal Server Error");
  }
};

// ==================== REFRESH TOKEN ====================
export const userRefreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) {
      return sendResponse(res as any, 400, false, "Refresh token is required");
    }

    jwt.verify(token, config.JWT_REFRESH_SECRET as string, async (err: any, decoded: any) => {
      if (err) {
        return sendResponse(res as any, 401, false, "Invalid refresh token");
      }

      const user = await User.findOne({ userId: decoded.userId });
      if (!user) {
        return sendResponse(res as any, 404, false, "User not found");
      }

      const accessToken = generateToken(decoded.userId, "access");

      return sendResponse(res, 200, true, "New access token generated", { accessToken });
    });
  } catch (error) {
    await Logger("refreshToken", error);
    return sendResponse(res, 500, false, "Internal Server Error");
  }
};

// ==================== LINK ACCOUNT ====================
export const linkAccount = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { googleIdToken, phoneToken, phoneNumber } = req.body;

    if (!userId) return sendResponse(res, 401, false, "Unauthorized");

    const user = await User.findOne({ userId: Number(userId), isDeleted: false });
    if (!user) return sendResponse(res, 404, false, "User not found");

    if (googleIdToken) {
      const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken: googleIdToken,
        audience: config.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();

      if (!payload) return sendResponse(res, 400, false, "Invalid Google credentials");

      const existingGoogle = await User.findOne({ googleId: payload.sub, role: { $in: APP_ACCOUNT_ROLES }, isDeleted: false });
      if (existingGoogle && existingGoogle.userId !== user.userId) {
        return sendResponse(res, 409, false, "This Google account is already linked to another user");
      }

      user.googleId = payload.sub;
      user.email = payload.email;
      user.emailVerified = payload.email_verified || false;
      await user.save();

      return sendResponse(res, 200, true, "Google account linked successfully", user);
    }

    if (phoneToken && phoneNumber) {
      const decodedToken = await admin.auth().verifyIdToken(phoneToken);
      if (!decodedToken?.phone_number) {
        return sendResponse(res, 400, false, "Invalid Firebase token");
      }

      const existingPhone = await User.findOne({ phoneNumber, role: { $in: APP_ACCOUNT_ROLES }, isDeleted: false });
      if (existingPhone && existingPhone.userId !== user.userId) {
        return sendResponse(res, 409, false, "This Phone number is already linked to another user");
      }

      user.phoneNumber = phoneNumber;
      user.phoneVerified = true;
      await user.save();

      return sendResponse(res, 200, true, "Phone number linked successfully", user);
    }

    return sendResponse(res, 400, false, "Provide either googleIdToken or phoneToken with phoneNumber");
  } catch (error: any) {
    await Logger("linkAccount", error);
    return sendResponse(res, 500, false, error.message);
  }
};
