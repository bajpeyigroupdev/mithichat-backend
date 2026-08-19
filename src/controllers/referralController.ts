import { Response } from 'express';
import { AuthRequest } from '../middlewares/authorize.middleware';
import { User } from '../models/user.model';
import { Referral } from '../models/referral.model';
import { RechargeHistory } from '../models/RechargeHistory';
import { sendResponse } from '../utils/response';
import Logger from '../utils/logger';

/**
 * Single atomic endpoint for new user mandatory profile completion + welcome reward (+100 💎) + optional referral reward (+50 💎 for referrer).
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

    // Grant New User Welcome Reward (+100 Diamonds) exactly once
    if (!currentUser.welcomeRewardClaimed) {
      currentUser.diamonds = Number(currentUser.diamonds || 0) + 100;
      currentUser.welcomeRewardClaimed = true;

      // Transaction log for welcome bonus
      await RechargeHistory.create({
        userId: currentUser.userId,
        type: 'online' as any,
        diamonds: 100,
        amount: 0,
        currency: 'INR',
        status: 'COMPLETED',
        date: new Date(),
        processedAt: new Date(),
        productId: 'WELCOME_BONUS',
        rawGoogleData: { note: '100 Diamonds Welcome Bonus on Profile Completion' },
      });
    }

    // Process Referral Reward if valid referrer provided
    if (referrerUser && !currentUser.referralClaimed) {
      currentUser.referredBy = referrerUser._id;
      currentUser.referralClaimed = true;

      // Credit Referrer +50 Diamonds
      await User.updateOne(
        { _id: referrerUser._id },
        {
          $inc: { diamonds: 50, totalReferrals: 1 },
        }
      );

      // Ledger entry for Referrer
      await RechargeHistory.create({
        userId: referrerUser.userId,
        type: 'online' as any,
        diamonds: 50,
        amount: 0,
        currency: 'INR',
        status: 'COMPLETED',
        date: new Date(),
        processedAt: new Date(),
        productId: 'REFERRAL_REWARD',
        rawGoogleData: { note: `50 Diamonds Referral Reward for inviting user ${currentUser.userId}` },
      });

      // Create Referral record (unique index on referee prevents duplicates)
      try {
        await Referral.create({
          referrer: referrerUser._id,
          referee: currentUser._id,
          referralCode: cleanReferralCode,
          referrerReward: 50,
          refereeReward: 100,
          status: 'CLAIMED',
          claimedAt: new Date(),
        });
      } catch (refErr: any) {
        console.log("Referral record duplicate warning:", refErr.message);
      }
    }

    await currentUser.save();

    return sendResponse(res, 200, true, "Profile completed successfully! You received 100 Diamonds welcome bonus.", {
      user: currentUser,
    });
  } catch (error: any) {
    await Logger("completeProfile", error);
    return sendResponse(res, 500, false, error.message || "Failed to complete profile");
  }
};

/**
 * GET Referral details & stats for logged-in user.
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

    // Ensure referralCode exists
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

    // Check self referral
    if (
      cleanCode === currentUser.referralCode ||
      cleanCode === currentUser.specialCode ||
      cleanCode === currentUser.employeeCode ||
      cleanCode === String(currentUser.userId)
    ) {
      return sendResponse(res, 400, false, "You cannot use your own referral code");
    }

    // Check already claimed
    const existingClaim = await Referral.findOne({ referee: currentUser._id });
    if (currentUser.referralClaimed || existingClaim) {
      return sendResponse(res, 400, false, "You have already claimed a referral code");
    }

    // Find referrer
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

    // Update currentUser
    currentUser.referredBy = referrerUser._id;
    currentUser.referralClaimed = true;
    await currentUser.save();

    // Credit Referrer +50 Diamonds
    await User.updateOne(
      { _id: referrerUser._id },
      { $inc: { diamonds: 50, totalReferrals: 1 } }
    );

    // Ledger for referrer
    await RechargeHistory.create({
      userId: referrerUser.userId,
      type: 'online' as any,
      diamonds: 50,
      amount: 0,
      currency: 'INR',
      status: 'COMPLETED',
      date: new Date(),
      processedAt: new Date(),
      productId: 'REFERRAL_REWARD',
      rawGoogleData: { note: `50 Diamonds Referral Reward for user ${currentUser.userId}` },
    });

    // Create Referral record
    await Referral.create({
      referrer: referrerUser._id,
      referee: currentUser._id,
      referralCode: cleanCode,
      referrerReward: 50,
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
