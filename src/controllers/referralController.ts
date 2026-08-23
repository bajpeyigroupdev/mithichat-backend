import { Response } from 'express';
import { AuthRequest } from '../middlewares/authorize.middleware';
import { User } from '../models/user.model';
import { Referral } from '../models/referral.model';
import { RechargeHistory } from '../models/RechargeHistory';
import { DeviceLimit } from '../models/deviceLimit.model';
import { RechargeType } from '../constants/user';
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

      const step1Coins = 25;
      const step1TxId = `REF_STEP1_${currentUser._id}`;

      // Risk Assessment Model
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      const riskFlags: string[] = [];
      let reviewStatus: 'PASSED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' = 'PASSED';

      const userDeviceId = (currentUser as any).device?.createdDeviceId || (currentUser as any).device?.currentDeviceId;
      if (userDeviceId) {
        const linkedAccounts = await User.countDocuments({
          $or: [
            { "device.createdDeviceId": userDeviceId },
            { "device.currentDeviceId": userDeviceId }
          ],
          isDeleted: false,
        });

        if (linkedAccounts > 2) {
          riskLevel = 'HIGH';
          riskFlags.push('MULTIPLE_ACCOUNTS_SAME_DEVICE');
          reviewStatus = 'PENDING_REVIEW';
          console.log(`[REFERRAL_RISK_FLAGGED] High risk referral flagged: ${linkedAccounts} accounts on device ${userDeviceId}`);
        }
      }

      let step1LedgerDoc: any = null;
      let shouldCreditStep1 = true;

      try {
        step1LedgerDoc = await RechargeHistory.create({
          userId: referrerUser.userId,
          type: RechargeType.REFERRAL_REGISTRATION_REWARD,
          coins: step1Coins,
          diamonds: 0,
          amount: 0,
          currency: 'COIN',
          status: 'COMPLETED',
          settlementStatus: 'PENDING',
          date: new Date(),
          processedAt: new Date(),
          productId: 'REFERRAL_STEP1_REWARD',
          transactionId: step1TxId,
          rawGoogleData: {
            type: 'REFERRAL_REGISTRATION_REWARD',
            amount: step1Coins,
            currency: 'COIN',
            referredUserId: currentUser.userId,
            note: `Step 1 Referral Reward: ${step1Coins} Coins for referring user ${currentUser.userId}`
          },
        });
      } catch (txErr: any) {
        if (txErr.code === 11000 || txErr.message?.includes('E11000')) {
          const existingTx = await RechargeHistory.findOne({ transactionId: step1TxId });
          if (existingTx) {
            if (existingTx.settlementStatus === 'SETTLED') {
              shouldCreditStep1 = false;
              step1LedgerDoc = existingTx;
              console.log(`[REFERRAL_STEP1_DUPLICATE_BLOCKED] Step 1 reward ${step1TxId} already SETTLED. Skipping balance credit.`);
            } else {
              step1LedgerDoc = existingTx;
            }
          }
        }
      }

      if (shouldCreditStep1) {
        console.log(`[REFERRAL_STEP1_SETTLEMENT_STARTED] Settling +25 Coins for referrer ${referrerUser.userId}`);
        await User.updateOne(
          { _id: referrerUser._id },
          { $inc: { coins: step1Coins, totalReferrals: 1 } }
        );

        if (step1LedgerDoc && step1LedgerDoc.settlementStatus !== 'SETTLED') {
          await RechargeHistory.updateOne(
            { _id: step1LedgerDoc._id },
            { $set: { settlementStatus: 'SETTLED', settledAt: new Date() } }
          );
        }
        console.log(`[REFERRAL_STEP1_SETTLED] Settled Step 1 +25 Coins for referrer ${referrerUser.userId}`);
      }

      try {
        await Referral.create({
          referrer: referrerUser._id,
          referee: currentUser._id,
          referralCode: cleanReferralCode,
          referrerReward: step1Coins,
          refereeReward: welcomeRewardAmount,
          step1Claimed: true,
          step1Coins,
          step1ClaimedAt: new Date(),
          step1RewardStatus: 'COMPLETED',
          step2Claimed: false,
          step2Coins: 0,
          step2RewardStatus: 'NOT_STARTED',
          totalCallSeconds: 0,
          riskLevel,
          riskFlags,
          reviewStatus,
          status: 'STEP1_CLAIMED',
          claimedAt: new Date(),
        });
      } catch (refErr: any) {
        console.log("Referral record duplicate warning:", refErr.message);
      }

      // Send Step 1 real-time socket & FCM push notification to Referrer
      try {
        const { getIO, getUserRoom } = require("../sockets");
        const { sendCallNotification } = require("../utils/pushNotification");

        const io = getIO();
        if (io) {
          io.to(getUserRoom(String(referrerUser._id))).emit("referralReward:step1", {
            coinsEarned: 25,
            refereeUserId: currentUser.userId,
            message: "🎉 Referral Reward Earned! Your friend successfully joined MithiChat. You received 25 Coins!",
          });
        }

        if (referrerUser.fcmToken) {
          await sendCallNotification(
            referrerUser.fcmToken,
            "🎉 Referral Reward Earned!",
            "Your friend successfully joined MithiChat. You received 25 Coins!",
            "",
            false
          ).catch(() => {});
        }
      } catch (notifErr: any) {
        console.warn("Step 1 referral notification warning:", notifErr?.message);
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
    const totalEarnedCoins = referrals.reduce(
      (sum, r) => sum + (r.step1Coins || 25) + (r.step2Claimed ? (r.step2Coins || 25) : 0),
      0
    );
    const pendingCallRewardsCount = referrals.filter((r) => !r.step2Claimed).length;
    const completedReferralsCount = referrals.filter((r) => r.step2Claimed).length;

    const hasRedeemedReferral = Boolean(
      user.referralClaimed || (await Referral.findOne({ referee: user._id }))
    );

    const referredUsers = referrals.map((r: any) => {
      const callSec = r.totalCallSeconds || 0;
      const callMin = Math.floor(callSec / 60);
      const callSecRem = callSec % 60;
      const formattedCallTime = `${callMin}:${callSecRem < 10 ? '0' : ''}${callSecRem}`;

      return {
        _id: r._id,
        name: r.referee?.name || 'New User',
        userId: r.referee?.userId,
        image: r.referee?.image || '',
        createdAt: r.createdAt || r.claimedAt,
        step1Claimed: Boolean(r.step1Claimed),
        step1Coins: r.step1Coins || 25,
        step1RewardStatus: r.step1RewardStatus || 'COMPLETED',
        step2Claimed: Boolean(r.step2Claimed),
        step2Coins: r.step2Coins || (r.step2Claimed ? 25 : 0),
        step2RewardStatus: r.step2RewardStatus || (r.step2Claimed ? 'COMPLETED' : 'NOT_STARTED'),
        totalCallSeconds: callSec,
        formattedCallTime,
        requiredCallSeconds: 300,
        riskLevel: r.riskLevel || 'LOW',
        reviewStatus: r.reviewStatus || 'PASSED',
        status: r.status || (r.step2Claimed ? 'COMPLETED' : 'STEP1_CLAIMED'),
        totalCoinsEarned: (r.step1Coins || 25) + (r.step2Claimed ? (r.step2Coins || 25) : 0),
      };
    });

    const referralLink = `https://mithichat.live/refer/${user.referralCode}`;

    return sendResponse(res, 200, true, "Referral details fetched successfully", {
      referralCode: user.referralCode,
      referralLink,
      totalReferrals,
      totalEarnedCoins,
      pendingCallRewardsCount,
      completedReferralsCount,
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

    const step1Coins = 25;
    const step1TxId = `REF_STEP1_${currentUser._id}`;
    currentUser.referredBy = referrerUser._id;
    currentUser.referralClaimed = true;
    await currentUser.save();

    let step1LedgerDoc: any = null;
    let shouldCreditStep1 = true;

    try {
      step1LedgerDoc = await RechargeHistory.create({
        userId: referrerUser.userId,
        type: RechargeType.REFERRAL_REGISTRATION_REWARD,
        coins: step1Coins,
        diamonds: 0,
        amount: 0,
        currency: 'COIN',
        status: 'COMPLETED',
        settlementStatus: 'PENDING',
        date: new Date(),
        processedAt: new Date(),
        productId: 'REFERRAL_STEP1_REWARD',
        transactionId: step1TxId,
        rawGoogleData: {
          type: 'REFERRAL_REGISTRATION_REWARD',
          amount: step1Coins,
          currency: 'COIN',
          referredUserId: currentUser.userId,
          note: `Step 1 Referral Reward: ${step1Coins} Coins for referring user ${currentUser.userId}`
        },
      });
    } catch (txErr: any) {
      if (txErr.code === 11000 || txErr.message?.includes('E11000')) {
        const existingTx = await RechargeHistory.findOne({ transactionId: step1TxId });
        if (existingTx) {
          if (existingTx.settlementStatus === 'SETTLED') {
            shouldCreditStep1 = false;
            step1LedgerDoc = existingTx;
          } else {
            step1LedgerDoc = existingTx;
          }
        }
      }
    }

    if (shouldCreditStep1) {
      await User.updateOne(
        { _id: referrerUser._id },
        { $inc: { coins: step1Coins, totalReferrals: 1 } }
      );

      if (step1LedgerDoc && step1LedgerDoc.settlementStatus !== 'SETTLED') {
        await RechargeHistory.updateOne(
          { _id: step1LedgerDoc._id },
          { $set: { settlementStatus: 'SETTLED', settledAt: new Date() } }
        );
      }
    }

    await Referral.create({
      referrer: referrerUser._id,
      referee: currentUser._id,
      referralCode: cleanCode,
      referrerReward: step1Coins,
      refereeReward: 100,
      step1Claimed: true,
      step1Coins,
      step1ClaimedAt: new Date(),
      step1RewardStatus: 'COMPLETED',
      step2Claimed: false,
      step2Coins: 0,
      step2RewardStatus: 'NOT_STARTED',
      totalCallSeconds: 0,
      status: 'STEP1_CLAIMED',
      claimedAt: new Date(),
    });

    // Send Step 1 real-time socket & FCM push notification to Referrer
    try {
      const { getIO, getUserRoom } = require("../sockets");
      const { sendCallNotification } = require("../utils/pushNotification");

      const io = getIO();
      if (io) {
        io.to(getUserRoom(String(referrerUser._id))).emit("referralReward:step1", {
          coinsEarned: 25,
          refereeUserId: currentUser.userId,
          message: "🎉 Referral Reward Earned! Your friend successfully joined MithiChat. You received 25 Coins!",
        });
      }

      if (referrerUser.fcmToken) {
        await sendCallNotification(
          referrerUser.fcmToken,
          "🎉 Referral Reward Earned!",
          "Your friend successfully joined MithiChat. You received 25 Coins!",
          "",
          false
        ).catch(() => {});
      }
    } catch (notifErr: any) {
      console.warn("Step 1 referral notification warning in claimReferralCode:", notifErr?.message);
    }

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
      { $group: { _id: null, totalCoins: { $sum: '$referrerReward' } } }
    ]);
    const totalCoinsGranted = aggregateReward[0]?.totalCoins || 0;

    // Aggregated top referrers by joined user count & earnings
    const referrerStats = await Referral.aggregate([
      {
        $group: {
          _id: '$referrer',
          joinedCount: { $sum: 1 },
          totalEarned: { $sum: '$referrerReward' },
          lastReferralDate: { $max: '$createdAt' }
        }
      },
      { $sort: { joinedCount: -1, totalEarned: -1 } },
      { $limit: 100 }
    ]);

    const referrerUserIds = referrerStats.map(s => s._id);
    const usersList = await User.find({
      $or: [
        { _id: { $in: referrerUserIds } },
        { totalReferrals: { $gt: 0 } }
      ]
    })
      .select('userId name email role image referralCode meethiId phoneNumber totalReferrals diamonds')
      .lean();

    const usersMap = new Map();
    usersList.forEach(u => usersMap.set(String(u._id), u));

    const topReferrers = referrerStats.map(stat => {
      const userObj = usersMap.get(String(stat._id)) || {};
      return {
        _id: stat._id,
        userId: userObj.userId,
        name: userObj.name || 'User',
        email: userObj.email,
        phoneNumber: userObj.phoneNumber,
        meethiId: userObj.meethiId || userObj.userId,
        referralCode: userObj.referralCode || `REF${userObj.userId}`,
        role: userObj.role || 'user',
        image: userObj.image,
        totalJoinedCount: stat.joinedCount,
        totalEarnings: stat.totalEarned,
        totalReferrals: userObj.totalReferrals || stat.joinedCount,
        lastReferralDate: stat.lastReferralDate,
      };
    });

    // Recent 100 referral logs with referee info
    const referralLogs = await Referral.find()
      .populate('referrer', 'userId name email image referralCode meethiId')
      .populate('referee', 'userId name email image createdAt meethiId phoneNumber')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return sendResponse(res, 200, true, "Admin referral analytics fetched successfully", {
      totalReferrals,
      totalCoinsGranted,
      totalDiamondsGranted: totalCoinsGranted,
      topReferrers,
      referralLogs,
    });
  } catch (error: any) {
    await Logger("getAdminReferrals", error);
    return sendResponse(res, 500, false, error.message || "Failed to fetch admin referral analytics");
  }
};

/**
 * GET Joined Users (Referees) under a specific Referrer User ID
 */
export const getReferrerReferees = async (req: AuthRequest, res: Response) => {
  try {
    const { referrerId } = req.params;
    if (!referrerId) {
      return sendResponse(res, 400, false, "Referrer ID is required");
    }

    let referrerUser: any = null;
    if (referrerId.match(/^[0-9a-fA-F]{24}$/)) {
      referrerUser = await User.findById(referrerId).lean();
    } else if (!isNaN(Number(referrerId))) {
      referrerUser = await User.findOne({ userId: Number(referrerId) }).lean();
    }

    if (!referrerUser) {
      return sendResponse(res, 404, false, "Referrer user not found");
    }

    const referrals = await Referral.find({ referrer: referrerUser._id })
      .populate('referee', 'userId name email phoneNumber meethiId role image createdAt isBlocked')
      .sort({ createdAt: -1 })
      .lean();

    const refereesList = referrals.map(r => ({
      referralId: r._id,
      referee: r.referee,
      referralCode: r.referralCode,
      referrerReward: r.referrerReward,
      refereeReward: r.refereeReward,
      step1RewardStatus: r.step1RewardStatus || 'COMPLETED',
      step2RewardStatus: r.step2RewardStatus || (r.step2Claimed ? 'COMPLETED' : 'NOT_STARTED'),
      riskLevel: r.riskLevel || 'LOW',
      riskFlags: r.riskFlags || [],
      reviewStatus: r.reviewStatus || 'PASSED',
      status: r.status,
      joinedAt: r.createdAt || r.claimedAt,
    }));

    const totalEarned = referrals.reduce((sum, r) => sum + (r.referrerReward || 0), 0);

    return sendResponse(res, 200, true, "Joined referees fetched successfully", {
      referrer: {
        _id: referrerUser._id,
        userId: referrerUser.userId,
        name: referrerUser.name,
        meethiId: referrerUser.meethiId,
        referralCode: referrerUser.referralCode,
      },
      totalJoined: refereesList.length,
      totalEarned,
      referees: refereesList,
    });
  } catch (error: any) {
    await Logger("getReferrerReferees", error);
    return sendResponse(res, 500, false, error.message || "Failed to fetch referee list");
  }
};

/**
 * POST Admin Manual Reconciliation Trigger
 */
export const triggerReconciliation = async (req: AuthRequest, res: Response) => {
  try {
    const { reconcileReferralFailures } = require('../services/referralReconciliationService');
    const metrics = await reconcileReferralFailures();

    return sendResponse(res, 200, true, "Referral crash reconciliation executed successfully", metrics);
  } catch (error: any) {
    await Logger("triggerReconciliation", error);
    return sendResponse(res, 500, false, error.message || "Failed to execute referral reconciliation");
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
