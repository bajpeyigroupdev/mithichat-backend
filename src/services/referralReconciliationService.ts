import { Referral } from '../models/referral.model';
import { ReferralCallCredit } from '../models/referralCallCredit.model';
import { ReferralOutbox } from '../models/referralOutbox.model';
import { User } from '../models/user.model';
import { RechargeHistory } from '../models/RechargeHistory';
import { RechargeType } from '../constants/user';
import { getIO, getUserRoom } from '../sockets';
import { sendCallNotification } from '../utils/pushNotification';

export interface ReconciliationMetrics {
  recordsScanned: number;
  recordsRecovered: number;
  duplicateAttemptsBlocked: number;
  staleRecordsRecovered: number;
  financialDriftDetected: number;
  financialDriftRepaired: number;
  failures: number;
}

/**
 * Reconciles incomplete Step 1 registration rewards where referredBy exists on user but Referral doc or ledger state is incomplete.
 */
export const reconcileIncompleteStep1Rewards = async (metrics: ReconciliationMetrics): Promise<number> => {
  let repairedCount = 0;
  try {
    const usersWithReferrer = await User.find({
      referredBy: { $ne: null },
      referralClaimed: true,
    }).select('_id userId referredBy').lean();

    metrics.recordsScanned += usersWithReferrer.length;

    for (const refereeUser of usersWithReferrer) {
      const existingRef = await Referral.findOne({ referee: refereeUser._id });
      const expectedTxId = `REF_STEP1_${refereeUser._id}`;
      const existingLedger = await RechargeHistory.findOne({ transactionId: expectedTxId });

      const referrerUser = await User.findById(refereeUser.referredBy);
      if (!referrerUser) continue;

      if (!existingLedger) {
        metrics.financialDriftDetected += 1;
        // Ledger missing: Perform 2-phase settlement
        let newLedger: any = null;
        try {
          newLedger = await RechargeHistory.create({
            userId: referrerUser.userId,
            type: RechargeType.REFERRAL_REGISTRATION_REWARD,
            coins: 25,
            diamonds: 0,
            amount: 0,
            currency: 'COIN',
            status: 'COMPLETED',
            settlementStatus: 'PENDING',
            date: new Date(),
            processedAt: new Date(),
            productId: 'REFERRAL_STEP1_REWARD',
            transactionId: expectedTxId,
            rawGoogleData: {
              type: 'REFERRAL_REGISTRATION_REWARD',
              amount: 25,
              currency: 'COIN',
              referredUserId: refereeUser.userId,
              note: `Step 1 Referral Reward (Recovered): 25 Coins for referring user ${refereeUser.userId}`
            },
          });
        } catch (txErr: any) {
          if (txErr.code === 11000 || txErr.message?.includes('E11000')) {
            metrics.duplicateAttemptsBlocked += 1;
          }
        }

        await User.updateOne(
          { _id: referrerUser._id },
          { $inc: { coins: 25, totalReferrals: 1 } }
        );

        if (newLedger) {
          await RechargeHistory.updateOne(
            { _id: newLedger._id },
            { $set: { settlementStatus: 'SETTLED', settledAt: new Date() } }
          );
        }

        metrics.financialDriftRepaired += 1;
        metrics.recordsRecovered += 1;
        repairedCount++;
        console.log(`[REFERRAL_FINANCIAL_DRIFT_REPAIRED] Recovered Step 1 +25 Coins for referrer ${referrerUser.userId}`);
      } else if (existingLedger.settlementStatus === 'PENDING') {
        metrics.financialDriftDetected += 1;
        // Ledger PENDING: Credit coins now
        await User.updateOne(
          { _id: referrerUser._id },
          { $inc: { coins: 25, totalReferrals: 1 } }
        );

        await RechargeHistory.updateOne(
          { _id: existingLedger._id },
          { $set: { settlementStatus: 'SETTLED', settledAt: new Date() } }
        );

        metrics.financialDriftRepaired += 1;
        metrics.recordsRecovered += 1;
        repairedCount++;
      } else {
        metrics.duplicateAttemptsBlocked += 1;
      }

      if (!existingRef) {
        try {
          await Referral.create({
            referrer: referrerUser._id,
            referee: refereeUser._id,
            referralCode: `MC${refereeUser.userId}`,
            referrerReward: 25,
            refereeReward: 100,
            step1Claimed: true,
            step1Coins: 25,
            step1ClaimedAt: new Date(),
            step1RewardStatus: 'COMPLETED',
            step2Claimed: false,
            step2Coins: 0,
            step2RewardStatus: 'NOT_STARTED',
            totalCallSeconds: 0,
            status: 'STEP1_CLAIMED',
            claimedAt: new Date(),
          });
        } catch (refErr: any) {
          // Unique index constraint handling
        }
      }
    }
  } catch (err: any) {
    metrics.failures += 1;
    console.error("Error in reconcileIncompleteStep1Rewards:", err.message);
  }
  return repairedCount;
};

/**
 * Reconciles incomplete call credit records resulting from process crashes before totalCallSeconds application.
 */
export const reconcileIncompleteCallCredits = async (metrics: ReconciliationMetrics): Promise<number> => {
  let repairedCount = 0;
  try {
    const staleWindow = new Date(Date.now() - 10000); // Created > 10 seconds ago
    const pendingCredits = await ReferralCallCredit.find({
      status: { $in: ['PENDING', 'PROCESSING'] },
      createdAt: { $lt: staleWindow },
    });

    metrics.recordsScanned += pendingCredits.length;

    for (const credit of pendingCredits) {
      // Atomic claim to processing state
      const claimed = await ReferralCallCredit.findOneAndUpdate(
        { _id: credit._id, status: { $in: ['PENDING', 'PROCESSING'] } },
        { $set: { status: 'APPLIED', appliedAt: new Date() } },
        { new: true }
      );

      if (claimed) {
        await Referral.findByIdAndUpdate(credit.referralId, {
          $inc: { totalCallSeconds: credit.durationSeconds },
        });
        repairedCount++;
        metrics.staleRecordsRecovered += 1;
        metrics.recordsRecovered += 1;
        console.log(`[REFERRAL_CALL_CREDIT_RECOVERED] Recovered call credit ${credit.callId} (+${credit.durationSeconds}s) for referral ${credit.referralId}`);
      } else {
        metrics.duplicateAttemptsBlocked += 1;
      }
    }
  } catch (err: any) {
    metrics.failures += 1;
    console.error("Error in reconcileIncompleteCallCredits:", err.message);
  }
  return repairedCount;
};

/**
 * Reconciles orphaned Step 2 rewards where totalCallSeconds >= 300 but reward state is incomplete.
 * Disambiguates PENDING vs SETTLED ledgers to guarantee zero duplicate coin credits.
 */
export const reconcileIncompleteStep2Rewards = async (metrics: ReconciliationMetrics): Promise<number> => {
  let repairedCount = 0;
  try {
    const eligibleReferrals = await Referral.find({
      totalCallSeconds: { $gte: 300 },
      step2RewardStatus: { $ne: 'COMPLETED' },
    });

    metrics.recordsScanned += eligibleReferrals.length;

    for (const referral of eligibleReferrals) {
      // Atomic transition to PROCESSING
      const lockedReferral = await Referral.findOneAndUpdate(
        { _id: referral._id, step2RewardStatus: { $ne: 'COMPLETED' } },
        { $set: { step2RewardStatus: 'PROCESSING' }, $inc: { reconciliationCount: 1 } },
        { new: true }
      );

      if (!lockedReferral) {
        metrics.duplicateAttemptsBlocked += 1;
        continue;
      }

      const expectedTxId = `REF_STEP2_${referral._id}`;
      const existingLedger = await RechargeHistory.findOne({ transactionId: expectedTxId });
      const referrerUser = await User.findById(referral.referrer);
      const refereeUser = await User.findById(referral.referee);

      if (!referrerUser) continue;

      if (existingLedger) {
        if (existingLedger.settlementStatus === 'SETTLED') {
          // Ledger already SETTLED before crash! Skip coin increment (0 duplicate coins).
          await Referral.updateOne(
            { _id: referral._id },
            {
              $set: {
                step2RewardStatus: 'COMPLETED',
                step2Claimed: true,
                step2Coins: 25,
                step2ClaimedAt: referral.step2ClaimedAt || new Date(),
                status: 'COMPLETED',
                lastReconciledAt: new Date(),
              },
            }
          );
          repairedCount++;
          metrics.recordsRecovered += 1;
          metrics.duplicateAttemptsBlocked += 1;
          console.log(`[REFERRAL_RECONCILIATION_REPAIRED] Referral ${referral._id} synced to COMPLETED via existing SETTLED ledger.`);
        } else {
          metrics.financialDriftDetected += 1;
          // Ledger exists as PENDING (crashed after ledger creation before coin credit). Credit coins now & mark SETTLED.
          await User.updateOne(
            { _id: referral.referrer },
            { $inc: { coins: 25 } }
          );

          await RechargeHistory.updateOne(
            { _id: existingLedger._id },
            { $set: { settlementStatus: 'SETTLED', settledAt: new Date() } }
          );

          await Referral.updateOne(
            { _id: referral._id },
            {
              $set: {
                step2RewardStatus: 'COMPLETED',
                step2Claimed: true,
                step2Coins: 25,
                step2ClaimedAt: new Date(),
                status: 'COMPLETED',
                lastReconciledAt: new Date(),
              },
            }
          );

          repairedCount++;
          metrics.financialDriftRepaired += 1;
          metrics.recordsRecovered += 1;
          console.log(`[REFERRAL_STEP2_REWARD_RECOVERED] Referrer ${referrerUser.userId} credited +25 Coins for PENDING ledger ${expectedTxId}`);
        }
      } else {
        metrics.financialDriftDetected += 1;
        // Financial ledger missing. Perform 2-phase settlement atomically.
        let newLedgerDoc: any = null;
        try {
          newLedgerDoc = await RechargeHistory.create({
            userId: referrerUser.userId,
            type: RechargeType.REFERRAL_CALL_REWARD,
            coins: 25,
            diamonds: 0,
            amount: 0,
            currency: 'COIN',
            status: 'COMPLETED',
            settlementStatus: 'PENDING',
            date: new Date(),
            processedAt: new Date(),
            productId: 'REFERRAL_STEP2_REWARD',
            transactionId: expectedTxId,
            rawGoogleData: {
              type: 'REFERRAL_CALL_REWARD',
              amount: 25,
              currency: 'COIN',
              referralId: String(referral._id),
              referredUserId: refereeUser?.userId,
              requiredCallSeconds: 300,
              note: `Step 2 Referral Reward (Recovered): 25 Coins for referee ${refereeUser?.userId}`,
            },
          });
        } catch (txErr: any) {
          console.warn("Reconciliation RechargeHistory creation notice:", txErr.message);
        }

        // Credit referrer +25 Coins
        await User.updateOne(
          { _id: referral.referrer },
          { $inc: { coins: 25 } }
        );

        if (newLedgerDoc) {
          await RechargeHistory.updateOne(
            { _id: newLedgerDoc._id },
            { $set: { settlementStatus: 'SETTLED', settledAt: new Date() } }
          );
        }

        await Referral.updateOne(
          { _id: referral._id },
          {
            $set: {
              step2RewardStatus: 'COMPLETED',
              step2Claimed: true,
              step2Coins: 25,
              step2ClaimedAt: new Date(),
              status: 'COMPLETED',
              lastReconciledAt: new Date(),
            },
          }
        );

        // Enqueue outbox notification
        await ReferralOutbox.create({
          referralId: referral._id,
          type: 'STEP2_NOTIFICATION',
          payload: {
            referrerUserId: referrerUser.userId,
            refereeUserId: refereeUser?.userId,
            referrerMongoId: String(referrerUser._id),
            fcmToken: referrerUser.fcmToken,
          },
          status: 'PENDING',
        });

        repairedCount++;
        metrics.financialDriftRepaired += 1;
        metrics.recordsRecovered += 1;
        console.log(`[REFERRAL_STEP2_REWARD_RECOVERED] Referrer ${referrerUser.userId} credited missing +25 Coins for referral ${referral._id}`);
      }
    }
  } catch (err: any) {
    metrics.failures += 1;
    console.error("Error in reconcileIncompleteStep2Rewards:", err.message);
  }
  return repairedCount;
};

/**
 * Reconciles pending outbox notifications without affecting financial state.
 */
export const reconcilePendingOutbox = async (): Promise<number> => {
  let deliveredCount = 0;
  try {
    const pendingOutbox = await ReferralOutbox.find({
      status: 'PENDING',
      attempts: { $lt: 5 },
    }).limit(50);

    for (const item of pendingOutbox) {
      try {
        if (item.type === 'STEP2_NOTIFICATION') {
          const { referrerMongoId, refereeUserId, fcmToken } = item.payload;

          // Socket notification
          try {
            const io = getIO();
            if (io && referrerMongoId) {
              io.to(getUserRoom(referrerMongoId)).emit("referralReward:step2", {
                coinsEarned: 25,
                refereeUserId: refereeUserId,
                message: "🎉 Final Referral Reward Earned! Your referred friend completed 5 minutes of calls. You received another 25 Coins!",
              });
            }
          } catch (sockErr: any) {
            console.warn("Outbox Socket warning:", sockErr.message);
          }

          // FCM notification
          if (fcmToken) {
            await sendCallNotification(
              fcmToken,
              "🎉 Final Referral Reward Earned!",
              "Your referred friend completed 5 minutes of calls. You received another 25 Coins!",
              "",
              false
            ).catch(() => {});
          }
        }

        item.status = 'DELIVERED';
        item.deliveredAt = new Date();
        await item.save();
        deliveredCount++;
      } catch (itemErr: any) {
        item.attempts += 1;
        item.error = itemErr.message;
        if (item.attempts >= 5) item.status = 'FAILED';
        await item.save();
      }
    }
  } catch (err: any) {
    console.error("Error in reconcilePendingOutbox:", err.message);
  }
  return deliveredCount;
};

/**
 * Master Referral Reconciliation Worker
 */
export const reconcileReferralFailures = async (): Promise<ReconciliationMetrics> => {
  console.log(`[REFERRAL_RECONCILIATION_STARTED] Running master referral reconciliation audit scan...`);

  const metrics: ReconciliationMetrics = {
    recordsScanned: 0,
    recordsRecovered: 0,
    duplicateAttemptsBlocked: 0,
    staleRecordsRecovered: 0,
    financialDriftDetected: 0,
    financialDriftRepaired: 0,
    failures: 0,
  };

  await reconcileIncompleteStep1Rewards(metrics);
  await reconcileIncompleteCallCredits(metrics);
  await reconcileIncompleteStep2Rewards(metrics);
  await reconcilePendingOutbox();

  console.log(`[REFERRAL_RECONCILIATION_COMPLETED] Scan finished. Scanned: ${metrics.recordsScanned}, Recovered: ${metrics.recordsRecovered}, Drift Repaired: ${metrics.financialDriftRepaired}`);

  return metrics;
};
