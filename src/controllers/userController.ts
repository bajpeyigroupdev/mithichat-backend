import { Response } from "express";
import { User } from "../models/user.model";
import sendResponse from "../utils/reponse";
import admin from "firebase-admin";
import { AuthRequest } from "../middlewares/authorize.middleware";
import { Query } from "mongoose";
import { BlockedUser } from "../models/blockedUser.model";
import { RechargeHistory } from "../models/RechargeHistory"; // Import Model
import { Agency } from "../models/agency.model";
import { CoinsTransaction } from "../models/spentCoinModel";
import HostLevel from "../models/hostLevel.model";
import mongoose from "mongoose";

// import { deleteFromS3, uploadToS3 } from "../utils/uploadS3";
import { generateOtp, sendCustomEmail, sendOtpForEmailVerification } from "../utils/otp";
import OtpModel from "../models/otp.model";
import { Logger } from "../utils/logger";
import { UserInterface } from "../interfaces/user.interface";
import { getAllHostsService, invalidateHostCache } from "../services/user.service";
import { getIO, getUserRoom } from "../sockets";
import { Gender } from "../constants/user";
import HelpRequest from "../models/help.model";
import DeletionRequest from "../models/deletionRequest.model";
import { deleteImageFromCloudinary } from "../utils/cloudinary";
import { getAccessibleUserFilter } from "./formsController";
import { generateSecureHash } from "../utils/passwordHelper";

// set user name by authorized users
export const setUserName = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, isUserName } = req.user || {};
    const { userName } = req.body;

    if (isUserName) {
      return sendResponse(res, 400, false, "UserName update only one time");
    }
    if (!userId || !userName) {
      return sendResponse(res, 400, false, "UserName is required");
    }
    const targetId = Number(userId)
    const checkAvailable = await User.findOne({ userName: userName });
    if (!checkAvailable) {
      await User.findOneAndUpdate({ userId: targetId }, { userName, isUserName: true }, { new: true });
      return sendResponse(res, 200, true, "UserName updated successfully");
    }
    // BUG-04 FIX: success must be false when username is taken
    return sendResponse(res, 400, false, "Not Available");

  } catch (error: any) {
    await Logger("Set Name Error", error)
    return sendResponse(res, 500, false, "Please try after some time");
  }
};

// email verification by authorized users
export const emailVerification = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { email } = req.body;

    if (!userId || !email) {
      return sendResponse(res, 400, false, "Email is required");
    }
    const targetId = Number(userId)
    let user = await User.findOne({ email });

    if (!user) {
      // If email doesn't exist, create a new user
      user = await User.findOneAndUpdate({ userId: targetId }, { email }, { new: true });
    }

    const otp = generateOtp();
    await OtpModel.create({ userId: targetId, otp }); // Saving OTP in the DB properly
    await sendOtpForEmailVerification(email, otp);

    return sendResponse(res, 200, true, "OTP sent successfully to email");
  } catch (error: any) {
    await Logger("emailVerification", error)
    return sendResponse(res, 500, false, error.message);
  }
};

// verify otp from email by authorized users
export const otpVerification = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { otp } = req.body;
    const targetId = Number(userId)
    if (!userId || !otp) {
      return sendResponse(res, 400, false, "otp is required")
    }

    const user = await OtpModel.findOne({ userId: targetId })

    if (!user) {
      return sendResponse(res, 404, false, "user not Found")
    }
    if (Number(user.otp) == otp) {
      await User.findOneAndUpdate({ userId }, { isEmailVerified: true }, { new: true })
      return sendResponse(res, 200, true, "email verified successfully")
    }

    return sendResponse(res, 200, true, "Invalid Otp")
  } catch (error: any) {
    await Logger("otpVerification", error)
    return sendResponse(res, 500, false, error.message)
  }
};

export const setVerifiedPhone = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { token } = req.body;

    if (!userId || !token) {
      return sendResponse(res, 400, false, "UserId and Firebase token are required");
    }

    // ✅ Verify the Firebase token sent from frontend after OTP verification
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log("decoded : ", decodedToken)
    if (!decodedToken?.phone_number) {
      return sendResponse(res, 400, false, "Invalid Firebase token");
    }

    // ✅ Update only the verification status
    const updatedUser = await User.findOneAndUpdate(
      { userId: Number(userId) },
      { phoneVerified: true },
      { new: true }
    );

    if (!updatedUser) {
      return sendResponse(res, 404, false, "User not found");
    }

    return sendResponse(res, 200, true, "Phone verified successfully", updatedUser);
  } catch (error: any) {
    console.log("error : ", error)
    await Logger("Set Verified Phone Error", error);
    return sendResponse(res, 500, false, "Please try again later");
  }
};

// get users with role based access
// work as expected
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { role, userId } = req.user || {};
    const { page = 1, limit = 10 } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    let usersQuery: Query<any[], any>;
    let totalUsers = 0;

    switch (role) {
      case "owner":
      case "operator":
      case "superAdmin":
        totalUsers = await User.countDocuments({
          isDeleted: false,
          role: { $ne: "superAdmin" }, // Exclude superAdmins
        });
        usersQuery = User.find({
          isDeleted: false,
          role: { $ne: "superAdmin" },
        })
          .select("userId name coins isBlocked createdAt role email phoneNumber image")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNumber);
        break;

      case "admin":
      case "agency":
        const scopedFilter = await getAccessibleUserFilter(req.user, {
          isDeleted: false,
          isBlocked: false,
        });
        totalUsers = await User.countDocuments(scopedFilter);
        usersQuery = User.find(scopedFilter)
          .select("userId name coins diamonds createdAt role email phoneNumber image")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNumber);
        break;


      case "host":
        const host = await User.findOne({ userId })
          .select("userId name email phoneNumber gender role bio image audio coins diamonds isBlocked emailVerified phoneVerified language frameId isUserName userName isActive level")
          .lean();
        if (host && host.level === undefined) host.level = 6;
        return sendResponse(res, 200, true, "User fetched successfully", { user: host });

      case "user":
        const user = await User.findOne({ userId })
          .select("userId name email gender phoneNumber role bio image coins diamonds isBlocked emailVerified phoneVerified language isUserName userName isActive level")
          .lean();
        if (user && user.level === undefined) user.level = 6;
        return sendResponse(res, 200, true, "User fetched successfully", { user });

      default:
        return sendResponse(res, 403, false, "Access Denied");
    }

    // Fetch users from the query
    const users = await usersQuery.exec();

    return sendResponse(res, 200, true, "Users fetched successfully", {
      usersData: {
        users,
        totalUsers,
        currentPage: pageNumber,
        totalPages: Math.ceil(totalUsers / limitNumber),
        limit: limitNumber,
      }
    });
  } catch (error: any) {
    await Logger("getUsers", error)
    return sendResponse(res, 500, false, error.message);
  }
};

// get user by query with role based access
export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const { role, userId: requesterId } = req.user || {};
    const { userId } = req.params;
    const { name, email, phoneNumber } = req.query; // Query params for superAdmin

    let query: any = { isDeleted: false };

    // If owner/operator/superAdmin, allow searching by name, email, or phoneNumber
    if (["owner", "operator", "superAdmin"].includes(role || "")) {
      if (userId) query.userId = userId;
      if (name) query.name = name;
      if (email) query.email = email;
      if (phoneNumber) query.phoneNumber = phoneNumber;
    } else {
      // For other roles, userId is required
      if (!userId) {
        return sendResponse(res, 400, false, "User ID is required");
      }
      query.userId = userId;
    }

    // Role-based filtering
    switch (role) {
      case "owner":
      case "operator":
      case "superAdmin":
        break; // SuperAdmin can see all users

      case "admin":
      case "agency":
        query = await getAccessibleUserFilter(req.user, { ...query, isBlocked: false });
        break;


      case "user":
      case "host":
        return sendResponse(res, 403, false, "Access Denied - Users cannot fetch details");

      default:
        return sendResponse(res, 403, false, "Access Denied");
    }

    // Fetch user based on the query
    const user = await User.findOne(query);
    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }

    return sendResponse(res, 200, true, "User fetched successfully", { user });
  } catch (error: any) {
    await Logger("getUserById", error)
    return sendResponse(res, 500, false, error.message);
  }
};

// update user by userID with role based update 
export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { name, phoneNumber, bio, role, coins, diamonds, language, gender, phoneVerified, image, country, age, password, level } = req.body;
    const { role: requesterRole, userId: requesterId } = req.user || {};

    let targetUserId: string;

    // Determine the target user ID based on the requester's role
    if (requesterRole === "user" || requesterRole === "host") {
      // A regular user can only update their own profile
      if (!requesterId) {
        return sendResponse(res, 400, false, "Requester ID missing");
      }
      targetUserId = String(requesterId);
    } else if (["owner", "operator", "superAdmin", "admin"].includes(requesterRole || '')) {
      // superAdmin, owner, operator, and admin can update any user by providing userId in params
      if (!req.params.userId) {
        return sendResponse(res, 400, false, "User ID is required in URL");
      }
      targetUserId = req.params.userId;
    } else {
      // For any other unexpected role
      return sendResponse(res, 403, false, "Access Denied: Invalid requester role");
    }

    // 🔍 Find the user to update
    const userToUpdate: UserInterface | null = await User.findOne({ userId: targetUserId, isDeleted: false });
    if (!userToUpdate) {
      return sendResponse(res, 404, false, "User not found");
    }

    if (userToUpdate.isBlocked) {
      return sendResponse(res, 403, false, "User is blocked and cannot be updated");
    }

    // Initialize with the specific interface for type safety
    const updatedFields: Partial<UserInterface> = {};

    // 📞 Check for duplicate phoneNumber
    if (phoneNumber && phoneNumber !== userToUpdate.phoneNumber) {
      const existingPhone = await User.findOne({ phoneNumber, isDeleted: false });
      if (existingPhone && existingPhone.userId !== userToUpdate.userId) { // Ensure it's not the same user
        return sendResponse(res, 400, false, "Phone number already in use by another user");
      }
      updatedFields.phoneNumber = phoneNumber;
    }

    // 🛡 Role-based permissions for what fields can be updated
    switch (requesterRole) {
      case "owner":
      case "operator":
      case "superAdmin":
      case "admin":
        // Admin staff can update all fields for any user
        if (name !== undefined) updatedFields.name = name;
        if (bio !== undefined) updatedFields.bio = bio;
        if (coins !== undefined) updatedFields.coins = coins;
        if (diamonds !== undefined) updatedFields.diamonds = diamonds;
        if (role !== undefined) {
          updatedFields.role = role;
          if (role === 'host') {
            updatedFields.gender = Gender.FEMALE;
          }
        }
        if (gender !== undefined) updatedFields.gender = gender;
        if (language && Array.isArray(language)) updatedFields.language = language;
        if (phoneVerified !== undefined) updatedFields.phoneVerified = phoneVerified;
        if (country !== undefined) updatedFields.country = country;
        if (age !== undefined) updatedFields.age = age;
        if (level !== undefined) updatedFields.level = level;
        if (image !== undefined) updatedFields.image = image;
        if (password !== undefined && password.trim() !== "") {
          updatedFields.password = await generateSecureHash(password);
        }
        break;

      case "host":
        // Host can update specific fields for any user (including themselves if targetUserId is their own)
        // Assuming hosts cannot change roles or coins directly for others
        if (name !== undefined) updatedFields.name = name;
        if (bio !== undefined) updatedFields.bio = bio;
        if (gender !== undefined) updatedFields.gender = gender;
        if (language && Array.isArray(language)) updatedFields.language = language;
        if (phoneVerified !== undefined) updatedFields.phoneVerified = phoneVerified;
        if (image !== undefined) updatedFields.image = image
        // IMPORTANT: If a host should NOT be able to update another host's or superAdmin's data,
        // you would add a check here, e.g.:
        // if (userToUpdate.role === "superAdmin" || userToUpdate.role === "host") {
        //     return sendResponse(res, 403, false, "Access Denied: Host cannot update superAdmin or other host profiles");
        // }
        break;

      case "user":
        // A regular user can only update their own specific fields
        // We've already ensured targetUserId === requesterId above for "user" role.
        if (name !== undefined) updatedFields.name = name;
        if (bio !== undefined) updatedFields.bio = bio;
        if (gender !== undefined) updatedFields.gender = gender;
        if (language && Array.isArray(language)) updatedFields.language = language;
        if (image !== undefined) updatedFields.image = image
        // A regular user should usually not be able to change isPhoneVerified themselves,
        // this is typically handled by an OTP process. Remove or manage carefully.
        // if (isPhoneVerified !== undefined) updatedFields.isPhoneVerified = isPhoneVerified;
        break;

      default:
        // This case should ideally not be hit if authentication middleware handles roles correctly
        return sendResponse(res, 403, false, "Access Denied: Unknown role");
    }

    // 💾 Apply and save updates
    if (Object.keys(updatedFields).length > 0) {
      Object.assign(userToUpdate, updatedFields);
      await userToUpdate.save();
      return sendResponse(res, 200, true, "User updated successfully");
    }

    return sendResponse(res, 400, false, "No valid fields to update");

  } catch (error: any) {
    await Logger("updateUser", error);
    return sendResponse(res, 500, false, error.message || "Internal server error");
  }
};

// user delete by userID with administrative roles
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { role, userId: requesterId } = req.user || {};

    // Allow if admin staff OR if user is deleting themselves
    if (!["owner", "operator", "superAdmin", "admin"].includes(role || "") && String(requesterId) !== String(userId)) {
      return sendResponse(res, 403, false, "Access Denied - Insufficient permissions to delete user");
    }

    const userToDelete = await User.findOne({ userId });
    if (!userToDelete) {
      return sendResponse(res, 404, false, "User not found");
    }

    // Ensure Firebase is initialized
    if (!admin.apps.length) {
      try {
        await import("../utils/pushNotification");
      } catch (e) {
        console.warn("Firebase was not initialized at user delete, doing lazy initialize:", e);
        admin.initializeApp();
      }
    }

    // 1. Delete Firebase Auth user if present
    if (userToDelete.phoneNumber) {
      try {
        const firebaseUser = await admin.auth().getUserByPhoneNumber(userToDelete.phoneNumber);
        if (firebaseUser) {
          await admin.auth().deleteUser(firebaseUser.uid);
          console.log(`Successfully deleted Firebase user for phone: ${userToDelete.phoneNumber}`);
        }
      } catch (err: any) {
        if (err.code !== 'auth/user-not-found') {
          console.error(`Firebase delete phone error: ${err.message}`);
        }
      }
    }

    if (userToDelete.email) {
      try {
        const firebaseUser = await admin.auth().getUserByEmail(userToDelete.email);
        if (firebaseUser) {
          await admin.auth().deleteUser(firebaseUser.uid);
          console.log(`Successfully deleted Firebase user for email: ${userToDelete.email}`);
        }
      } catch (err: any) {
        if (err.code !== 'auth/user-not-found') {
          console.error(`Firebase delete email error: ${err.message}`);
        }
      }
    }

    // 2. Remove associated Kyc documents
    try {
      const { Kyc } = await import("../models/kyc.model");
      await Kyc.deleteMany({ userId: userToDelete.userId });
    } catch (e: any) {
      console.warn("Could not clear KYC data:", e.message);
    }

    // 3. Remove associated Host records
    try {
      const HostModel = (await import("../models/host.model")).default;
      await HostModel.deleteMany({ hostId: userToDelete.userId });
    } catch (e: any) {
      console.warn("Could not clear Host data:", e.message);
    }

    // 4. Remove associated TempHost records
    try {
      const TempHostModel = (await import("../models/temp.host.model")).default;
      await TempHostModel.deleteMany({ userId: userToDelete.userId });
    } catch (e: any) {
      console.warn("Could not clear TempHost data:", e.message);
    }

    // 5. Remove associated BlockedUser records
    try {
      await BlockedUser.deleteMany({
        $or: [
          { userId: String(userToDelete.userId) },
          { blockedBy: String(userToDelete.userId) }
        ]
      });
    } catch (e: any) {
      console.warn("Could not clear BlockedUser records:", e.message);
    }

    // 6. Remove associated Agency records
    try {
      const { Agency } = await import("../models/agency.model");
      await Agency.deleteMany({ ownerId: userToDelete._id });
    } catch (e: any) {
      console.warn("Could not clear Agency records:", e.message);
    }

    // 7. Remove associated DeletionRequest records
    try {
      await DeletionRequest.deleteMany({ userId: userToDelete._id });
    } catch (e: any) {
      console.warn("Could not clear DeletionRequest records:", e.message);
    }

    // 8. Remove associated HelpRequest records
    try {
      await HelpRequest.deleteMany({ userId: userToDelete.userId });
    } catch (e: any) {
      console.warn("Could not clear HelpRequest records:", e.message);
    }

    // 9. Pull deleted user _id from all other users' blocked list
    try {
      await User.updateMany(
        { blockedUsers: userToDelete._id },
        { $pull: { blockedUsers: userToDelete._id } }
      );
    } catch (e: any) {
      console.warn("Could not update other users' blocked lists:", e.message);
    }

    // 10. Clear Redis online state
    try {
      const redis = (await import("../configs/redisConfig")).default;
      await redis.srem("online_users", String(userToDelete.userId));
    } catch (e: any) {
      console.warn("Could not srem from online_users:", e.message);
    }

    // 11. Broadcast force logout on Socket.IO
    try {
      const io = getIO();
      const userRoom = getUserRoom(String(userToDelete.userId));
      io.to(userRoom).emit("force_logout", { reason: "Account permanently deleted" });
      io.in(userRoom).disconnectSockets(true);
    } catch (e: any) {
      console.warn("Socket force logout warning:", e.message);
    }

    // 12. Hard delete User document itself from MongoDB
    await User.deleteOne({ _id: userToDelete._id });

    return sendResponse(res, 200, true, "User and all associated records permanently deleted successfully");
  } catch (error: any) {
    await Logger("deleteUser", error)
    return sendResponse(res, 500, false, error.message);
  }
};

// user block by userID with role only role superAdmin and admin with reason
export const blockUser = async (req: AuthRequest, res: Response) => {
  try {
    const { role = "", userId: adminId = "" } = req.user || {}; // Ensure role & adminId are strings
    const { userId } = req.params;
    const { reason } = req.body; // Block reason

    // Only SuperAdmin & Admin can block users
    if (!["superAdmin", "admin"].includes(role)) {
      return sendResponse(res, 403, false, "Permission denied");
    }

    // If Admin, reason is required
    if (role === "admin" && !reason) {
      return sendResponse(res, 400, false, "Reason is required for Admin");
    }

    // Check if user is already blocked
    const existingUser = await User.findOne({ userId, isDeleted: false });
    if (!existingUser) {
      return sendResponse(res, 404, false, "User not found");
    }

    if (existingUser.isBlocked) {
      return sendResponse(res, 400, false, "User is already blocked");
    }

    // Update user (Set isBlocked: true)
    existingUser.isBlocked = true;
    await existingUser.save();

    // Store block details in BlockedUser model
    await BlockedUser.create({
      userId,
      blockedBy: adminId,
      reason: role === "superAdmin" ? reason || "" : reason, // Optional for SuperAdmin
    });

    return sendResponse(res, 200, true, "User blocked successfully");
  } catch (error: any) {
    await Logger("blockUser", error)
    return sendResponse(res, 500, false, error.message);
  }
};

// user unblock by userID with role only superAdmin
export const unblockUser = async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.user || {}; // Authenticated user
    const { userId } = req.params;

    // Only SuperAdmin can unblock users
    if (role !== "superAdmin") {
      return sendResponse(res, 403, false, "Only SuperAdmin can unblock users");
    }

    // Find the user
    const user = await User.findOne({ userId, isDeleted: false });

    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }

    // Check if the user is already unblocked
    if (!user.isBlocked) {
      return sendResponse(res, 400, false, "User is not blocked");
    }

    // Unblock the user (Set isBlocked: false)
    user.isBlocked = false;
    await user.save();

    // Remove from BlockedUser model
    await BlockedUser.deleteOne({ userId });

    return sendResponse(res, 200, true, "User unblocked successfully");
  } catch (error: any) {
    await Logger("unblockUser", error)
    return sendResponse(res, 500, false, error.message);
  }
};

// profile upload by only user and superAdmin
export const uploadImage = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { role = "", userId = "" } = req.user || {};
    const folderName = "profileImages"
    const targetUserId = parseInt(id)
    // Check user permission

    if (userId !== targetUserId && role !== 'superAdmin') {
      return sendResponse(res, 403, false, 'Permission denied')
    }

    if (!targetUserId) {
      return sendResponse(res, 400, false, 'User ID is required')
    }

    const { image } = req.body; // Expecting Cloudinary URL

    if (!image) {
      return sendResponse(res, 400, false, 'Image URL is required')
    }

    // Update User's image field in MongoDB
    const updatedUser = await User.findOneAndUpdate({ userId: targetUserId }, { image: image }, { new: true });

    if (!updatedUser) {
      // If user not updated, delete the image from Cloudinary
      await deleteImageFromCloudinary(image);
      return sendResponse(res, 404, false, 'User not found, image removed')
    }
    return sendResponse(res, 201, true, "image updated successfully")

  } catch (error: any) {
    await Logger("uploadImage", error)
    // Cleanup on error
    if (req.body.image) {
      await deleteImageFromCloudinary(req.body.image);
    }
    return sendResponse(res, 500, false, error.message)
  }
};

// get all hosts with role based access 
export const getAllHosts = async (req: AuthRequest, res: Response) => {
  try {
    const { role, userId } = req.user || {} as any;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "10", 10);

    const hostsData = await getAllHostsService({ role, page, limit, userId });

    return sendResponse(res, 200, true, "Hosts fetched successfully", { hostsData });
  } catch (error: any) {
    await Logger("getAllHosts", error);
    return sendResponse(res, error.message === "Access Denied" ? 403 : 500, false, error.message);
  }
};

// ============ Admin: Get all host-role users ============
export const getAdminHostUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.user || {};
    if (!["owner", "operator", "superAdmin", "admin"].includes(role || "")) {
      return sendResponse(res, 403, false, "Unauthorized access");
    }

    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { role: "host", isDeleted: false };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const [hosts, total, maxLevelDoc] = await Promise.all([
      User.find(filter)
        .select("userId name image phoneNumber email gender level coins diamonds isBlocked isOnline isActive country language agencyId createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean() as any,
      User.countDocuments(filter),
      HostLevel.findOne().sort({ level: -1 }).lean(),
    ]);

    const maxLevel: number = (maxLevelDoc as any)?.level || 8;

    // Enrich each host with agency name + call/gift coin stats
    const enriched = await Promise.all(hosts.map(async (host: any) => {
      // Agency name lookup
      let agencyName: string | null = null;
      if (host.agencyId) {
        const agency = await Agency.findById(host.agencyId).select("name").lean() as any;
        agencyName = agency?.name || null;
      }

      // Aggregate: coins received by host (coinsSpent by users on this host)
      const hostObjectId = host._id;
      const coinStats = await CoinsTransaction.aggregate([
        { $match: { hostId: hostObjectId } },
        {
          $group: {
            _id: "$type",
            totalCoinsReceived: { $sum: "$coinsSpent" },
            totalDiamondEarned: { $sum: "$hostEarning" },
          },
        },
      ]);

      let callCoinsReceived = 0;
      let giftCoinsReceived = 0;
      let callDiamondsEarned = 0;
      let giftDiamondsEarned = 0;

      for (const stat of coinStats) {
        if (stat._id === "voice_call") {
          callCoinsReceived = stat.totalCoinsReceived || 0;
          callDiamondsEarned = stat.totalDiamondEarned || 0;
        } else if (stat._id === "gift" || stat._id === "gift_sent") {
          giftCoinsReceived += stat.totalCoinsReceived || 0;
          giftDiamondsEarned += stat.totalDiamondEarned || 0;
        }
      }

      return {
        ...host,
        agencyName,
        callCoinsReceived,
        giftCoinsReceived,
        totalCoinsReceived: callCoinsReceived + giftCoinsReceived,
        callDiamondsEarned,
        giftDiamondsEarned,
        totalDiamondsEarned: callDiamondsEarned + giftDiamondsEarned,
      };
    }));

    return sendResponse(res, 200, true, "Host users fetched successfully", {
      total,
      page,
      limit,
      maxLevel,
      data: enriched,
    });
  } catch (error: any) {
    await Logger("getAdminHostUsers", error);
    return sendResponse(res, 500, false, error.message);
  }
};

// save fcm token
export const saveFcmToken = async (req: AuthRequest, res: Response) => {
  try {
    const { fcmToken } = req.body;
    const { userId } = req.user || {};

    if (!fcmToken) {
      return sendResponse(res, 400, false, "FCM token is required");
    }

    if (!userId) {
      return sendResponse(res, 401, false, "Unauthorized - User not found");
    }

    const user = await User.findOne({ userId, isDeleted: false });
    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }

    user.fcmToken = fcmToken;
    await user.save();

    return sendResponse(res, 200, true, "FCM token saved successfully");
  } catch (error: any) {
    await Logger("saveFcmToken", error)
    return sendResponse(res, 500, false, error.message);
  }
};
// get user recharge history
export const getRechargeHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, role } = req.user || {};
    const { page = 1, limit = 10, targetUserId } = req.query;

    let finalUserId = userId;
    if (["owner", "operator", "superAdmin", "admin"].includes(role || "") && targetUserId) {
      finalUserId = Number(targetUserId);
    }

    if (!finalUserId) {
      return sendResponse(res, 400, false, "User ID is required");
    }

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const totalRecords = await RechargeHistory.countDocuments({ userId: Number(finalUserId) });

    const history = await RechargeHistory.find({ userId: Number(finalUserId) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    return sendResponse(res, 200, true, "Recharge history fetched successfully", {
      history,
      totalRecords,
      currentPage: pageNumber,
      totalPages: Math.ceil(totalRecords / limitNumber),
    });
  } catch (error: any) {
    await Logger("getRechargeHistory", error);
    return sendResponse(res, 500, false, error.message);
  }
};

// get coin transaction history (calls, gifts, messages)
export const getCoinHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, role } = req.user || {};
    const { page = 1, limit = 50, targetUserId } = req.query;

    let finalUserId = userId;
    if (["owner", "operator", "superAdmin", "admin"].includes(role || "") && targetUserId) {
      finalUserId = Number(targetUserId);
    }

    if (!finalUserId) {
      return sendResponse(res, 400, false, "User ID is required");
    }

    const user = await User.findOne({ userId: finalUserId, isDeleted: false });
    if (!user) return sendResponse(res, 404, false, "User not found");

    const { CoinsTransaction } = await import("../models/spentCoinModel");

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const transactions = await CoinsTransaction.find({
      $or: [{ userId: user._id }, { hostId: user._id }]
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    const userIdStr = (user as any)._id.toString();
    const history = transactions.map(tx => {
      const isHost = tx.hostId && tx.hostId.toString() === userIdStr;
      const amount = isHost ? (tx.hostEarning || 0) : (tx.coinsSpent || 0);
      const isEarning = isHost || (tx.type as string) === "recharge";
      const displayType = isHost && (tx.type as string) === "voice_call" ? "call_earning" : tx.type;

      return {
        type: displayType,
        coinsSpent: amount,
        coins: amount,
        isEarning,
        createdAt: tx.createdAt,
        meta: tx.meta,
      };
    });

    return sendResponse(res, 200, true, "Coin history fetched", { history });
  } catch (error: any) {
    await Logger("getCoinHistory", error);
    return sendResponse(res, 500, false, error.message);
  }
};

// Help & Support


export const submitHelpRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { reason, message } = req.body;

    if (!reason || !message) {
      return sendResponse(res, 400, false, "Reason and message are required");
    }

    // Direct Upload Refactor: Image comes as URL in body
    const { image } = req.body;
    const imagePath = image || "";

    const helpRequest = await HelpRequest.create({
      userId,
      reason,
      message,
      image: imagePath,
    });

    return sendResponse(res, 201, true, "Help request submitted successfully", helpRequest);
  } catch (error: any) {
    if (req.body.image) {
      // Cleanup if DB logic failed
      // Need to import deleteImageFromCloudinary first
      // await deleteImageFromCloudinary(req.body.image);
    }
    console.error("Help Submit Error:", error);
    return sendResponse(res, 500, false, error.message || "Failed to submit help request");
  }
};

export const submitSupportRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { reason, message } = req.body;

    if (!reason || !message) {
      return sendResponse(res, 400, false, "Reason and message are required");
    }

    // Direct Upload Refactor
    const { image } = req.body;
    const imagePath = image || "";

    const helpRequest = await HelpRequest.create({
      userId,
      reason,
      message,
      image: imagePath,
      type: 'support',
    });

    return sendResponse(res, 201, true, "Support request submitted successfully", helpRequest);
  } catch (error: any) {
    console.error("Support Submit Error:", error);
    return sendResponse(res, 500, false, error.message || "Failed to submit support request");
  }
};


// Toggle Active Status
import LiveHistory from "../models/liveHistory.model";

export const toggleActiveStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { status } = req.body; // true = ON (Live), false = OFF (Offline)

    if (typeof status !== 'boolean') {
      return sendResponse(res, 400, false, "Status (boolean) is required");
    }

    if (!userId) {
      return sendResponse(res, 401, false, "Unauthorized");
    }

    const user = await User.findOne({ userId, isDeleted: false });
    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }

    // Role check: Only hosts? Or users too? User said "host active status".
    // Let's allow users too if they want, but primarily for hosts.
    // if (user.role !== 'host') { ... } // Optional constraint

    // 1. If Turning ON
    if (status) {
      if (user.isActive) {
        return sendResponse(res, 200, true, "User is already active", { isActive: true });
      }

      await User.findByIdAndUpdate(user._id, { isActive: true });

      // Create new active session
      await LiveHistory.create({
        userId: user._id,
        startTime: new Date(),
        status: 'active'
      });

      // Emit to all users that host list has updated
      invalidateHostCache();
      const hostsData = await getAllHostsService({ role: "user", page: 1, limit: 50 });
      getIO().emit("hostsUpdated", hostsData);

      return sendResponse(res, 200, true, "You are now Live", { isActive: true });
    }

    // 2. If Turning OFF
    else {
      if (!user.isActive) {
        return sendResponse(res, 200, true, "User is already offline", { isActive: false });
      }

      await User.findByIdAndUpdate(user._id, { isActive: false });

      // Find active session and close it
      const activeSession = await LiveHistory.findOne({
        userId: user._id,
        status: 'active'
      }).sort({ startTime: -1 });

      if (activeSession) {
        const endTime = new Date();
        const duration = Math.floor((endTime.getTime() - activeSession.startTime.getTime()) / 1000); // seconds

        activeSession.endTime = endTime;
        activeSession.duration = duration;
        activeSession.status = 'completed';
        await activeSession.save();
      }

      // Emit to all users that host list has updated
      invalidateHostCache();
      const hostsData = await getAllHostsService({ role: "user", page: 1, limit: 50 });
      getIO().emit("hostsUpdated", hostsData);

      return sendResponse(res, 200, true, "You are now Offline", { isActive: false });
    }

  } catch (error: any) {
    console.error("Toggle Status Error:", error);
    return sendResponse(res, 500, false, error.message || "Failed to update status");
  }
};



// 🛑 Add user to personal blocklist
export const blockContact = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { id: targetUserId } = req.params;

    if (!userId) return sendResponse(res, 401, false, "Unauthorized");

    const user = await User.findOne({ userId, isDeleted: false });
    const targetUser = await User.findOne({ userId: Number(targetUserId), isDeleted: false });

    if (!user || !targetUser) {
      return sendResponse(res, 404, false, "User not found");
    }

    if (user.blockedUsers && user.blockedUsers.some(id => id.toString() === (targetUser as any)._id.toString())) {
      return sendResponse(res, 400, false, "User already blocked");
    }

    await User.findByIdAndUpdate(user._id, {
      $addToSet: { blockedUsers: (targetUser as any)._id }
    });

    return sendResponse(res, 200, true, "User blocked successfully");
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

// 🟢 Remove user from personal blocklist
export const unblockContact = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { id: targetUserId } = req.params;

    if (!userId) return sendResponse(res, 401, false, "Unauthorized");

    const user = await User.findOne({ userId, isDeleted: false });
    const targetUser = await User.findOne({ userId: Number(targetUserId), isDeleted: false });

    if (!user || !targetUser) {
      return sendResponse(res, 404, false, "User not found");
    }

    await User.findByIdAndUpdate(user._id, {
      $pull: { blockedUsers: (targetUser as any)._id }
    });

    return sendResponse(res, 200, true, "User unblocked successfully");
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

// 📋 Get blocked contacts list
export const getBlockedContacts = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};

    if (!userId) return sendResponse(res, 401, false, "Unauthorized");

    const user = await User.findOne({ userId, isDeleted: false })
      .populate("blockedUsers", "userId name image");

    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }

    return sendResponse(res, 200, true, "Blocked contacts fetched", {
      blockedUsers: user.blockedUsers || []
    });
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message);
  }
};

// 🔄 Exchange Coins to Diamonds
const EXCHANGE_PACKAGES: Record<number, number> = {
  1000: 900,
  2000: 1800,
  5000: 4500,
  10000: 9000,
  20000: 18000,
  50000: 45000,
  100000: 90000,
  200000: 180000,
  500000: 450000
};

export const exchangeCoinsToDiamonds = async (req: AuthRequest, res: Response) => {
  try {

    console.log("===== EXCHANGE REQUEST =====");
    console.log("req.user =", req.user);
    console.log("req.body =", req.body);


    const { userId } = req.user || {};
    const { coins } = req.body;

    if (!userId) return sendResponse(res, 401, false, "Unauthorized");

    const coinsNum = Number(coins);
    if (isNaN(coinsNum) || coinsNum <= 0) {
      return sendResponse(res, 400, false, "Invalid coins amount");
    }

    const diamondYield = EXCHANGE_PACKAGES[coinsNum];
    if (!diamondYield) {
      return sendResponse(res, 400, false, "Invalid exchange package");
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId, isDeleted: false, coins: { $gte: coinsNum } },
      {
        $inc: {
          coins: -coinsNum,
          diamonds: diamondYield
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      const exists = await User.exists({ userId, isDeleted: false });
      return sendResponse(res, exists ? 400 : 404, false, exists ? "Insufficient coins balance" : "User not found");
    }

    return sendResponse(res, 200, true, "Exchange successful", {
      coins: updatedUser.coins,
      diamonds: updatedUser.diamonds
    });
  } catch (error: any) {
    console.error("❌ Exchange coins backend error:", error);
    return sendResponse(res, 500, false, error.message);
  }
};

export const getMyHelpRequests = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    if (!userId) {
      return sendResponse(res, 401, false, "Unauthorized");
    }

    const helpRequests = await HelpRequest.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return sendResponse(res, 200, true, "Help requests fetched successfully", helpRequests);
  } catch (error: any) {
    console.error("❌ Get my help requests backend error:", error);
    return sendResponse(res, 500, false, error.message || "Failed to fetch help requests");
  }
};

// User replies to or reopens a ticket
export const replyToHelpTicket = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    if (!userId) return sendResponse(res, 401, false, "Unauthorized");

    const { id } = req.params;
    const { message, reopen } = req.body;

    if (!message?.trim()) {
      return sendResponse(res, 400, false, "Message is required");
    }

    const ticket = await HelpRequest.findOne({ _id: id, userId });
    if (!ticket) return sendResponse(res, 404, false, "Ticket not found");

    // Push user reply to thread
    ticket.replies.push({ sender: 'user', message: message.trim(), createdAt: new Date() } as any);

    // If reopening
    if (reopen && ticket.status === 'resolved') {
      ticket.status = 'reopened';
      ticket.reopenCount = (ticket.reopenCount || 0) + 1;
    } else if (ticket.status === 'resolved' || ticket.status === 'rejected') {
      // Any reply on resolved = reopen
      ticket.status = 'reopened';
      ticket.reopenCount = (ticket.reopenCount || 0) + 1;
    }

    await ticket.save();
    return sendResponse(res, 200, true, "Reply submitted successfully", ticket);
  } catch (error: any) {
    console.error("❌ Reply to ticket error:", error);
    return sendResponse(res, 500, false, error.message || "Failed to submit reply");
  }
};

export const requestDeletion = async (req: AuthRequest, res: Response) => {
  try {
    const { id: requesterObjectId } = req.user || {};
    const { reason } = req.body;

    if (!requesterObjectId) {
      return sendResponse(res, 401, false, "Unauthorized");
    }

    if (!reason || !reason.trim()) {
      return sendResponse(res, 400, false, "Reason for deletion is required");
    }

    const userDoc = await User.findById(requesterObjectId);
    if (!userDoc) {
      return sendResponse(res, 404, false, "User not found");
    }

    const request = await DeletionRequest.create({
      userId: requesterObjectId,
      meethiId: String(userDoc.userId),
      name: userDoc.name || "User",
      role: userDoc.role || "user",
      phoneNumber: userDoc.phoneNumber || "",
      reason,
      status: "pending"
    });

    return sendResponse(res, 201, true, "Deletion request submitted successfully", request);
  } catch (error: any) {
    await Logger("requestDeletion", error);
    return sendResponse(res, 500, false, error.message || "Failed to request deletion");
  }
};

