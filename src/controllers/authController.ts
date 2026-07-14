
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

export const resetPassword = async (req: Request, res: Response) => {

  try {
    const { phoneNumber, newPassword } = req.body;

    if (!phoneNumber || !newPassword) {
      return sendResponse(res, 400, false, "Phone number and new password are required");
    }

    const user = await User.findOne({ phoneNumber, isDeleted: false });
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
    console.log("========== GOOGLE AUTH ERROR ==========");
    console.dir(error, { depth: null });

    console.log("NAME:", error?.name);
    console.log("MESSAGE:", error?.message);
    console.log("CODE:", error?.code);
    console.log("STACK:", error?.stack);

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

    // Trim + normalize: remove all spaces
    const phoneNumber = String(rawPhone).trim().replace(/\s+/g, "");

    console.log(`[forgotPassword] Looking up phone: "${phoneNumber}"`);

    // Query: match phoneNumber AND (isDeleted is false OR isDeleted field doesn't exist)
    const user = await User.findOne({
      phoneNumber,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
    });

    console.log(`[forgotPassword] User found: ${user ? `userId=${user.userId}` : "NOT FOUND"}`);

    if (!user) {
      return sendResponse(res, 404, false, "No account found with this phone number. Please check and try again.");
    }

    if (user.isBlocked) {
      return sendResponse(res, 403, false, "Your account is currently blocked. Please contact support.");
    }

    // Phone found — frontend will navigate to OTP screen
    return sendResponse(res, 200, true, "Phone number verified. OTP sent successfully.");
  } catch (error: any) {
    await Logger("forgotPassword", error);
    return sendResponse(res, 500, false, error.message || "Internal Server Error");
  }
};

export const checkPhoneAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phone = req.body?.phoneNumber?.trim();
    const deviceId = req.body?.deviceId?.trim();

    if (!phone) return sendResponse(res, 400, false, "Phone number is required.");
    if (!deviceId) return sendResponse(res, 400, false, "Device ID is required.");

    // 🔹 Step 1: Check if this device already has an account
    // const userByDevice = await User.findOne({
    //   $or: [
    //     { "device.createdDeviceId": deviceId },
    //     { "device.currentDeviceId": deviceId },
    //     { "device.loggedInDeviceIds": deviceId }
    //   ],
    //   isDeleted: false
    // }).lean();

    // if (userByDevice) {
    //   return sendResponse(res, 403, false, "This device already has an account.");
    // }

    // 🔹 Step 2: Check if phone number already exists
    const existingUser = await User.findOne({ phoneNumber: phone, isDeleted: false }).lean();

    if (existingUser) {
      if (existingUser.isBlocked) {
        return sendResponse(res, 403, false, "Your account is currently blocked.");
      }

      return sendResponse(res, 400, false, "Phone number already registered.");
    }

    // 🔹 Step 3: New device + new phone → send OTP for registration
    return sendResponse(res, 200, true, "New device & phone. Send OTP for registration.");
  } catch (err) {
    await Logger("checkPhoneAvailability", err);
    return sendResponse(res, 500, false, "Something went wrong while verifying the phone number.");
  }
};


// ==================== REGISTER ====================
export const userRegister = async (req: AuthRequest, res: Response) => {
  try {
    const { phoneNumber, password, gender, deviceId, userFrom, language, country } = req.body;

    if (!phoneNumber || !password || !gender) {
      return sendResponse(res, 400, false, "Phone number, password and gender are required");
    }

    if (userFrom === "app") {
      if (!deviceId) {
        return sendResponse(res, 400, false, "deviceId is required for app users");
      }

      // ✅ Device already registered with another user → block
      const existingUser = await User.findOne({
        "device.createdDeviceId": deviceId,
        isDeleted: false,
      });
      if (existingUser) {
        return sendResponse(res, 409, false, "This device already created an account");
      }
    }

    // ✅ Unique ID and defaults
    const userId = await generateUniqueId();
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
        image = ""
      }
    }
    const newUser = new User({
      phoneNumber,
      password: hashedPassword,
      gender,
      userId,
      phoneVerified: true,
      name,
      image,
      language,
      country,
      authType: "phone",
      device: {
        createdDeviceId: deviceId || "",   // fixed at signup
        currentDeviceId: deviceId || "",
        loggedInDeviceIds: deviceId ? [deviceId] : [],
      },
    });

    await newUser.save();

    // ✅ Generate tokens
    const accessToken = await generateToken(newUser.userId.toString(), "access");
    const refreshToken = await generateToken(newUser.userId.toString(), "refresh");

    newUser.refreshToken = refreshToken;
    await newUser.save();

    // ✅ Response with tokens
    return sendResponse(res, 201, true, "User created successfully", {
      accessToken,
      refreshToken,
      role: newUser.role,
    });

  } catch (error: any) {
    await Logger("signUp", error);
    return sendResponse(res, 500, false, error.message);
  }
};


// ==================== LOGIN ====================
export const userLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneNumber, userId, password, deviceId, userFrom } = req.body;

    const query = phoneNumber ? { phoneNumber } : { userId };
    const user = await User.findOne({ ...query, isDeleted: false }).select("+password");

    if (!user) {
      return sendResponse(res, 400, false, "Account not found, please sign up.");
    }

    if (user.isBlocked) {
      return sendResponse(res, 403, false, "You are blocked due to some reason.");
    }

    // ✅ For app users: handle device logic
    if (userFrom === "app") {
      if (!deviceId) {
        return sendResponse(res, 400, false, "deviceId is required for app users.");
      }

      user.device = user.device || {
        createdDeviceId: "",
        currentDeviceId: "",
        loggedInDeviceIds: [],
      };

      // ❌ createdDeviceId never changes after signup
      // ✅ Update current + loggedIn devices
      user.device.currentDeviceId = deviceId;
      if (!user.device.loggedInDeviceIds.includes(deviceId)) {
        user.device.loggedInDeviceIds.push(deviceId);
      }

      await user.save();
    }

    // ✅ Password match
    const isMatch = await verifySecureHash(password, user.password as string);
    if (!isMatch) {
      return sendResponse(res, 400, false, "Invalid credentials.");
    }

    const accessToken = await generateToken(user.userId.toString(), "access");
    const refreshToken = await generateToken(user.userId.toString(), "refresh");

    user.refreshToken = refreshToken;
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

      // ✅ Remove only that device
      user.device.loggedInDeviceIds = user.device.loggedInDeviceIds.filter(
        (id) => id !== deviceId
      );

      if (user.device.currentDeviceId === deviceId) {
        user.device.currentDeviceId = "";
      }

      await user.save();
    }

    // ✅ Invalidate refresh token globally
    user.refreshToken = "";
    await user.save();

    return sendResponse(res, 200, true, "Logout successful.");
  } catch (error: any) {
    await Logger("logout", error);
    return sendResponse(res, 500, false, error.message);
  }
};


export const userGoogleAuth = async (req: Request, res: Response) => {
  const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

  try {
    const { googleIdToken, deviceId, userFrom, gender, language, country } = req.body;

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

    // 1️⃣ Check if user exists
    let user = await User.findOne({ googleId: googleUserInfo.googleId, isDeleted: false });

    if (user) {
      // Existing user → login
      if (userFrom === "app") {
        user.device = user.device || { createdDeviceId: "", currentDeviceId: "", loggedInDeviceIds: [] };
        if (!user.device.createdDeviceId) user.device.createdDeviceId = deviceId;
        if (!user.device.loggedInDeviceIds.includes(deviceId)) user.device.loggedInDeviceIds.push(deviceId);
        user.device.currentDeviceId = deviceId;
        await user.save();
      }

      const accessToken = await generateToken(user.userId.toString(), "access");
      const refreshToken = await generateToken(user.userId.toString(), "refresh");
      user.refreshToken = refreshToken;
      await user.save();

      return sendResponse(res, 200, true, "Google login successful", {
        accessToken,
        refreshToken,
        role: user.role,
        gender: user.gender,
        isAccount: true,
      });
    }

    // 2️⃣ New user → require gender & language
    if (!gender || !Array.isArray(language) || language.length < 2 || !country?.name) {
      return sendResponse(res, 428, false, "Complete gender, country and 2 languages to create your account");
    }

    // Check duplicate email
    const existingEmailUser = await User.findOne({ email: googleUserInfo.email });
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
        image = ""
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
      country,
      device: userFrom === "app" ? { createdDeviceId: deviceId, currentDeviceId: deviceId, loggedInDeviceIds: [deviceId] } : {},
    });

    const accessToken = await generateToken(newUser.userId.toString(), "access");
    const refreshToken = await generateToken(newUser.userId.toString(), "refresh");
    newUser.refreshToken = refreshToken;
    const userCreated = await newUser.save();

    return sendResponse(res, 201, true, "Google signup successful", { accessToken, refreshToken, role: userCreated.role, gender: userCreated.gender });

  } catch (error: any) {
    if (error.message && error.message.includes("Wrong recipient")) {
      console.error(`[GOOGLE AUTH DEBUG] Audience mismatch. Backend expected: ${config.GOOGLE_CLIENT_ID}`);
      // The error object might contain the actual audience if we're lucky, 
      // otherwise the user needs to check their app's client ID.
    }
    await Logger("googleAuth", error);
    return sendResponse(res, 500, false, error.message || "Internal Server Error");
  }

};



export const userRefreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) {
      // return next(new AppError("Refresh token is required", 400));
      return sendResponse(res as any, 400, true, "Refresh token is required")
    }

    jwt.verify(token, config.JWT_REFRESH_SECRET as string, async (err: any, decoded: any) => {
      if (err) {
        return sendResponse(res as any, 401, true, "Invalid refresh token")
        // return next(new AppError("Invalid refresh token", 401));
      }

      const user = await User.findOne({ userId: decoded.userId });
      if (!user) {
        return sendResponse(res as any, 404, true, "User not found")
        // return next(new AppError("User not found", 404));
      }

      // await checkUserBlockStatus(user, next); // (DISABLED)

      const accessToken = generateToken(decoded.userId, "access");

      return sendResponse(res, 200, true, "New access token generated", { accessToken });
    });
  } catch (error) {
    await Logger("refreshToken", error)
    return sendResponse(res, 500, false, "Internal Server Error")
  }
};

export const linkAccount = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { googleIdToken, phoneToken, phoneNumber } = req.body;

    if (!userId) return sendResponse(res, 401, false, "Unauthorized");

    const user = await User.findOne({ userId: Number(userId), isDeleted: false });
    if (!user) return sendResponse(res, 404, false, "User not found");

    // 1. Link Google Account
    if (googleIdToken) {
      const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken: googleIdToken,
        audience: config.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();

      if (!payload) return sendResponse(res, 400, false, "Invalid Google credentials");

      // Check if another user is using this google account
      const existingGoogle = await User.findOne({ googleId: payload.sub, isDeleted: false });
      if (existingGoogle && existingGoogle.userId !== user.userId) {
        return sendResponse(res, 409, false, "This Google account is already linked to another user");
      }

      user.googleId = payload.sub;
      user.email = payload.email;
      user.emailVerified = payload.email_verified || false;
      await user.save();

      return sendResponse(res, 200, true, "Google account linked successfully", user);
    }

    // 2. Link Phone Number
    if (phoneToken && phoneNumber) {
      const decodedToken = await admin.auth().verifyIdToken(phoneToken);
      if (!decodedToken?.phone_number) {
        return sendResponse(res, 400, false, "Invalid Firebase token");
      }

      // Check if another user is using this phone number
      const existingPhone = await User.findOne({ phoneNumber, isDeleted: false });
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
