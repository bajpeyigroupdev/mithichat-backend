import { User } from '../models/user.model';
import { Referral } from '../models/referral.model';
import { RechargeHistory } from '../models/RechargeHistory';
import { getIO, getUserRoom } from '../sockets';
import { sendCallNotification } from '../utils/pushNotification';

/**
 * Evaluates 2-Step Referral Call Milestone:
 * When a referee (invited user) completes a call, adds call duration seconds.
 * When cumulative call time reaches 300s (5 minutes), credits +25 COINS (0 Diamonds) to Referrer.
 */
export const evaluateReferralCallMilestone = async (refereeUserId: any, callDurationSec: number) => {
  try {
    if (!refereeUserId || callDurationSec <= 0) return;

    // Find the referee user document
    const refereeUser = await User.findById(refereeUserId).lean();
    if (!refereeUser) return;

    // Find referral record where referee is this user
    const referral = await Referral.findOne({ referee: refereeUser._id });
    if (!referral) return;

    // Update cumulative call seconds
    const newTotalSeconds = (referral.totalCallSeconds || 0) + callDurationSec;
    referral.totalCallSeconds = newTotalSeconds;

    // Check if 5 minutes (300s) reached and step 2 not yet claimed
    if (newTotalSeconds >= 300 && !referral.step2Claimed) {
      referral.step2Claimed = true;
      referral.step2Coins = 25;
      referral.step2ClaimedAt = new Date();
      referral.referrerReward = (referral.step1Coins || 25) + 25; // 50 total coins
      referral.status = 'COMPLETED';

      // Credit Referrer 25 COINS (0 DIAMONDS)
      await User.updateOne(
        { _id: referral.referrer },
        { $inc: { coins: 25 } }
      );

      const referrerUser = await User.findById(referral.referrer);
      if (referrerUser) {
        // Record transaction log in RechargeHistory
        await RechargeHistory.create({
          userId: referrerUser.userId,
          type: 'online' as any,
          coins: 25,
          diamonds: 0,
          amount: 0,
          currency: 'INR',
          status: 'COMPLETED',
          date: new Date(),
          processedAt: new Date(),
          productId: 'REFERRAL_STEP2_REWARD',
          rawGoogleData: {
            note: `Step 2 Referral Reward: 25 Coins (5 Min Call Milestone) for referee user ${refereeUser.userId}`
          },
        });

        // Real-time socket notification to referrer
        try {
          const io = getIO();
          if (io) {
            io.to(getUserRoom(String(referral.referrer))).emit("referralReward:step2", {
              coinsEarned: 25,
              refereeUserId: refereeUser.userId,
              message: "🎉 You earned 25 Bonus Coins! Your invited friend completed 5 minutes of call time!",
            });
          }
        } catch (sockErr) {
          console.warn("Socket notification error in step2 referral reward:", sockErr);
        }

        // FCM Push notification to referrer
        if (referrerUser.fcmToken) {
          await sendCallNotification(
            referrerUser.fcmToken,
            "Referral Reward! 🎉",
            "You earned 25 Bonus Coins because your invited friend completed 5 minutes of call time!",
            "",
            false
          ).catch(() => {});
        }
      }
    }

    await referral.save();
  } catch (err: any) {
    console.error("Error in evaluateReferralCallMilestone:", err.message);
  }
};
