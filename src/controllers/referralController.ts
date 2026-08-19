import { Response } from 'express';
import { AuthRequest } from '../middlewares/authorize.middleware';
import { User } from '../models/user.model';
import { Referral } from '../models/referral.model';
import { RechargeHistory } from '../models/RechargeHistory';
import { DeviceLimit } from '../models/deviceLimit.model';
import { getCachedSettings } from './settingsController';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

/**
 * Single atomic endpoint for new user mandatory profile completion + welcome reward + optional referral reward.
 */
export const completeProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { name, username, avatar, referralCode } = req.body;

    if (!userId) {
      return sendResponse(res, 401, false, "Unauthorized access");
    }

    const currentUser = await User.findOne({ userId: Number(userId) });
    if (!currentUser) {
      return sendResponse(res, 404, false, "User not found");
    }

    // Fetch dynamic reward settings (or fall back to 100 & 50)
    const settings = await getCachedSettings();
    const welcomeRewardAmount = settings?.welcomeRewardDiamonds ?? 100;
    const referralRewardAmount = settings?.referralRewardDiamonds ?? 50;

    // Idempotency: If user already completed profile, return success with current profile
    if (currentUser.profileCompleted && currentUser.welcomeRewardClaimed) {
      return sendResponse(res, 200, true, "Profile already completed", { user: currentUser });
    }

    // 1. Validate Name
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      return sendResponse(res, 400, false, "Name is required");
    }

    // 2. Validate Username
    const trimmedUsername = String(username || '').trim();
    if (!trimmedUsername) {
      return sendResponse(res, 400, false, "Username is required");
    }

    if (currentUser.isUserName && currentUser.userName && currentUser.userName !== trimmedUsername) {
      return sendResponse(res, 400, false, "Username can only be set once");
    }

    // Check if username is taken by another user
    const existingUsername = await User.findOne({
      userName: trimmedUsername,
      _id: { $ne: currentUser._id },
    });
    if (existingUsername) {
      return sendResponse(res, 400, false, "Username is already taken");
    }

    // 3. Validate Avatar
    const selectedAvatar = String(avatar || '').trim();
    if (!selectedAvatar) {
      return sendResponse(res, 400, false, "Avatar selection is required");
    }

    // 4. Validate Referral Code (Optional)
    let referrerUser: any = null;
    const cleanReferralCode = String(referralCode || '').trim().toUpperCase();

    if (cleanReferralCode) {
      // Prevent self-referral
      if (
        cleanReferralCode === currentUser.referralCode ||
        cleanReferralCode === currentUser.specialCode ||
        cleanReferralCode === currentUser.employeeCode ||
        cleanReferralCode === String(currentUser.userId)
      ) {
        return sendResponse(res, 400, false, "You cannot use your own referral code");
      }

      // Check if current user already claimed a referral
      const existingClaim = await Referral.findOne({ referee: currentUser._id });
      if (currentUser.referralClaimed || existingClaim) {
        return sendResponse(res, 400, false, "You have already claimed a referral reward");
      }

      // Search for referrer
      referrerUser = await User.findOne({
        $or: [
          { referralCode: cleanReferralCode },
          { specialCode: cleanReferralCode },
          { employeeCode: cleanReferralCode },
          { userId: Number(cleanReferralCode) || -1 },
        ],
        isDeleted: false,
      });

      if (!referrerUser) {
        return sendResponse(res, 400, false, "Invalid referral code");
      }

      if (String(referrerUser._id) === String(currentUser._id)) {
        return sendResponse(res, 400, false, "You cannot use your own referral code");
      }
    }

    // Generate referralCode for currentUser if not exists
    if (!currentUser.referralCode) {
      currentUser.referralCode = `MC${currentUser.userId}`;
    }

    // Update user profile fields
    currentUser.name = trimmedName;
    currentUser.userName = trimmedUsername;
    currentUser.isUserName = true;
    currentUser.image = selectedAvatar;
    currentUser.profileCompleted = true;

    // Grant New User Welcome Reward exactly once
    if (!currentUser.welcomeRewardClaimed) {
      currentUser.diamonds = Number(currentUser.diamonds || 0) + welcomeRewardAmount;
      currentUser.welcomeRewardClaimed = true;

      // Transaction log for welcome bonus
      await RechargeHistory.create({
        userId: currentUser.userId,
        type: 'online' as any,
        diamonds: welcomeRewardAmount,
        amount: 0,
        currency: 'INR',
        status: 'COMPLETED',
        date: new Date(),
        processedAt: new Date(),
        productId: 'WELCOME_BONUS',
        rawGoogleData: { note: `${welcomeRewardAmount} Diamonds Welcome Bonus on Profile Completion` },
      });
    }

    // Process Referral Reward if valid referrer provided
    if (referrerUser && !currentUser.referralClaimed) {
      currentUser.referredBy = referrerUser._id;
      currentUser.referralClaimed = true;

      // Credit Referrer
      await User.updateOne(
        { _id: referrerUser._id },
        {
          $inc: { diamonds: referralRewardAmount, totalReferrals: 1 },
        }
      );

      // Ledger entry for Referrer
      await RechargeHistory.create({
        userId: referrerUser.userId,
        type: 'online' as any,
        diamonds: referralRewardAmount,
        amount: 0,
        currency: 'INR',
        status: 'COMPLETED',
        date: new Date(),
        processedAt: new Date(),
        productId: 'REFERRAL_REWARD',
        rawGoogleData: { note: `${referralRewardAmount} Diamonds Referral Reward for user ${currentUser.userId}` },
      });

      // Create Referral record
      try {
        await Referral.create({
          referrer: referrerUser._id,
          referee: currentUser._id,
          referralCode: cleanReferralCode,
          referrerReward: referralRewardAmount,
          refereeReward: welcomeRewardAmount,
          status: 'CLAIMED',
          claimedAt: new Date(),
        });
      } catch (refErr: any) {
        console.log("Referral record duplicate warning:", refErr.message);
      }
    }

    await currentUser.save();

    return sendResponse(res, 200, true, `Profile completed successfully! You received ${welcomeRewardAmount} Diamonds welcome bonus.`, {
      user: currentUser,
    });
  } catch (error: any) {
    await Logger("completeProfile", error);
    return sendResponse(res, 500, false, error.message || "Failed to complete profile");
  }
};

/**
 * GET Referral details & stats for logged-in mobile user.
 */
export const getReferralDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    if (!userId) {
      return sendResponse(res, 401, false, "Unauthorized");
    }

    const user = await User.findOne({ userId: Number(userId) });
    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }

    if (!user.referralCode) {
      user.referralCode = `MC${user.userId}`;
      await user.save();
    }

    const referrals = await Referral.find({ referrer: user._id })
      .populate('referee', 'name image createdAt userId')
      .sort({ createdAt: -1 })
      .lean();

    const totalReferrals = referrals.length || user.totalReferrals || 0;
    const totalEarnedDiamonds = referrals.reduce((sum, r) => sum + (r.referrerReward || 50), 0);

    const hasRedeemedReferral = Boolean(
      user.referralClaimed || (await Referral.findOne({ referee: user._id }))
    );

    const referredUsers = referrals.map((r: any) => ({
      name: r.referee?.name || 'New User',
      image: r.referee?.image || '',
      createdAt: r.createdAt || r.claimedAt,
      rewardDiamonds: r.referrerReward || 50,
    }));

    const referralLink = `https://mithichat.live/invite?ref=${user.referralCode}`;

    return sendResponse(res, 200, true, "Referral details fetched successfully", {
      referralCode: user.referralCode,
      referralLink,
      totalReferrals,
      totalEarnedDiamonds,
      hasRedeemedReferral,
      referredUsers,
    });
  } catch (error: any) {
    await Logger("getReferralDetails", error);
    return sendResponse(res, 500, false, error.message || "Failed to fetch referral details");
  }
};

/**
 * POST Claim/Redeem a referral code post-onboarding.
 */
export const claimReferralCode = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { referralCode } = req.body;

    if (!userId) {
      return sendResponse(res, 401, false, "Unauthorized");
    }

    const cleanCode = String(referralCode || '').trim().toUpperCase();
    if (!cleanCode) {
      return sendResponse(res, 400, false, "Referral code is required");
    }

    const currentUser = await User.findOne({ userId: Number(userId) });
    if (!currentUser) {
      return sendResponse(res, 404, false, "User not found");
    }

    const settings = await getCachedSettings();
    const referralRewardAmount = settings?.referralRewardDiamonds ?? 50;

    if (
      cleanCode === currentUser.referralCode ||
      cleanCode === currentUser.specialCode ||
      cleanCode === currentUser.employeeCode ||
      cleanCode === String(currentUser.userId)
    ) {
      return sendResponse(res, 400, false, "You cannot use your own referral code");
    }

    const existingClaim = await Referral.findOne({ referee: currentUser._id });
    if (currentUser.referralClaimed || existingClaim) {
      return sendResponse(res, 400, false, "You have already claimed a referral code");
    }

    const referrerUser = await User.findOne({
      $or: [
        { referralCode: cleanCode },
        { specialCode: cleanCode },
        { employeeCode: cleanCode },
        { userId: Number(cleanCode) || -1 },
      ],
      isDeleted: false,
    });

    if (!referrerUser) {
      return sendResponse(res, 400, false, "Invalid referral code");
    }

    if (String(referrerUser._id) === String(currentUser._id)) {
      return sendResponse(res, 400, false, "You cannot use your own referral code");
    }

    currentUser.referredBy = referrerUser._id;
    currentUser.referralClaimed = true;
    await currentUser.save();

    await User.updateOne(
      { _id: referrerUser._id },
      { $inc: { diamonds: referralRewardAmount, totalReferrals: 1 } }
    );

    await RechargeHistory.create({
      userId: referrerUser.userId,
      type: 'online' as any,
      diamonds: referralRewardAmount,
      amount: 0,
      currency: 'INR',
      status: 'COMPLETED',
      date: new Date(),
      processedAt: new Date(),
      productId: 'REFERRAL_REWARD',
      rawGoogleData: { note: `${referralRewardAmount} Diamonds Referral Reward for user ${currentUser.userId}` },
    });

    await Referral.create({
      referrer: referrerUser._id,
      referee: currentUser._id,
      referralCode: cleanCode,
      referrerReward: referralRewardAmount,
      refereeReward: 100,
      status: 'CLAIMED',
      claimedAt: new Date(),
    });

    return sendResponse(res, 200, true, "Referral code redeemed successfully!", {
      referralCode: cleanCode,
    });
  } catch (error: any) {
    await Logger("claimReferralCode", error);
    return sendResponse(res, 500, false, error.message || "Failed to redeem referral code");
  }
};

/**
 * GET Admin Referral Report & Leaderboard (For Admin & Management Panels).
 */
export const getAdminReferrals = async (req: AuthRequest, res: Response) => {
  try {
    const totalReferrals = await Referral.countDocuments();
    const aggregateReward = await Referral.aggregate([
      { $group: { _id: null, totalDiamonds: { $sum: '$referrerReward' } } }
    ]);
    const totalDiamondsGranted = aggregateReward[0]?.totalDiamonds || 0;

    // Leaderboard of top referrers
    const topReferrers = await User.find({ totalReferrals: { $gt: 0 } })
      .select('userId name email role image referralCode totalReferrals diamonds')
      .sort({ totalReferrals: -1 })
      .limit(50)
      .lean();

    // Recent 50 referral logs
    const referralLogs = await Referral.find()
      .populate('referrer', 'userId name email image referralCode')
      .populate('referee', 'userId name email image createdAt')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return sendResponse(res, 200, true, "Admin referral analytics fetched successfully", {
      totalReferrals,
      totalDiamondsGranted,
      topReferrers,
      referralLogs,
    });
  } catch (error: any) {
    await Logger("getAdminReferrals", error);
    return sendResponse(res, 500, false, error.message || "Failed to fetch admin referral analytics");
  }
};

/**
 * GET & POST Admin Device Limit Overrides
 */
export const getDeviceLimits = async (req: AuthRequest, res: Response) => {
  try {
    const limits = await DeviceLimit.find().sort({ updatedAt: -1 }).lean();
    const settings = await getCachedSettings();
    return sendResponse(res, 200, true, "Device limits fetched", {
      defaultMaxAccounts: settings?.defaultMaxAccountsPerDevice || 1,
      deviceOverrides: limits,
    });
  } catch (error: any) {
    await Logger("getDeviceLimits", error);
    return sendResponse(res, 500, false, error.message);
  }
};

export const updateDeviceLimit = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId, maxAllowedAccounts, note } = req.body;
    if (!deviceId) {
      return sendResponse(res, 400, false, "Device ID is required");
    }

    const limit = Number(maxAllowedAccounts);
    const validLimit = isNaN(limit) ? 1 : Math.max(0, limit);

    const deviceLimit = await DeviceLimit.findOneAndUpdate(
      { deviceId: String(deviceId).trim() },
      {
        $set: {
          maxAllowedAccounts: validLimit,
          note: note || '',
          updatedBy: (req.user as any)?._id,
        },
      },
      { new: true, upsert: true }
    );

    return sendResponse(res, 200, true, "Device registration limit updated successfully", deviceLimit);
  } catch (error: any) {
    await Logger("updateDeviceLimit", error);
    return sendResponse(res, 500, false, error.message);
  }
};

/**
 * GET Search User by User ID / Meethi ID / Phone to get Device ID & all linked accounts.
 */
export const getUserDeviceDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { identifier } = req.params;
    const cleanId = String(identifier || '').trim();

    if (!cleanId) {
      return sendResponse(res, 400, false, "User identifier is required");
    }

    const queryConditions: any[] = [
      { meethiId: { $regex: cleanId, $options: 'i' } },
      { phoneNumber: cleanId },
      { email: { $regex: cleanId, $options: 'i' } },
      { userName: { $regex: cleanId, $options: 'i' } },
    ];

    if (!isNaN(Number(cleanId))) {
      queryConditions.push({ userId: Number(cleanId) });
    }

    if (cleanId.match(/^[0-9a-fA-F]{24}$/)) {
      queryConditions.push({ _id: cleanId });
    }

    const targetUser = await User.findOne({ $or: queryConditions }).select('-password -refreshToken').lean();

    if (!targetUser) {
      return sendResponse(res, 404, false, "User not found with the provided identifier");
    }

    const deviceId = (targetUser as any).device?.createdDeviceId || (targetUser as any).device?.currentDeviceId || null;
    const ipAddress = (targetUser as any).ipAddress || (targetUser as any).lastIp || (targetUser as any).device?.ipAddress || null;
    let registeredAccounts: any[] = [];
    let customLimit: any = null;

    if (deviceId || ipAddress) {
      const matchConditions: any[] = [];
      if (deviceId) matchConditions.push({ "device.createdDeviceId": deviceId });
      if (ipAddress) matchConditions.push({ ipAddress });

      registeredAccounts = await User.find({
        $or: matchConditions,
        isDeleted: false,
      })
        .select('userId name phoneNumber role image isBlocked createdAt meethiId device ipAddress lastIp')
        .sort({ createdAt: -1 })
        .lean();

      customLimit = await DeviceLimit.findOne({
        $or: [
          ...(deviceId ? [{ deviceId }] : []),
          ...(ipAddress ? [{ ipAddress }] : [])
        ]
      }).lean();
    } else {
      registeredAccounts = [targetUser];
    }

    const settings = await getCachedSettings();

    return sendResponse(res, 200, true, "User device & IP details fetched successfully", {
      user: targetUser,
      deviceId,
      ipAddress,
      totalAccountsCount: registeredAccounts.length,
      maxAllowedAccounts: customLimit ? customLimit.maxAllowedAccounts : (settings?.defaultMaxAccountsPerDevice || 1),
      customLimit,
      registeredAccounts,
    });
  } catch (error: any) {
    await Logger("getUserDeviceDetails", error);
    return sendResponse(res, 500, false, error.message || "Failed to fetch user device details");
  }
};

