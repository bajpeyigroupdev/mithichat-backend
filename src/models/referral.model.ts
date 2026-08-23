import mongoose, { Schema, Document } from 'mongoose';

export type Step1RewardStatus = 'NOT_STARTED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type Step2RewardStatus = 'NOT_STARTED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ReviewStatus = 'PASSED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface IReferral extends Document {
  referrer: mongoose.Types.ObjectId;
  referee: mongoose.Types.ObjectId;
  referralCode: string;
  referrerReward: number;
  refereeReward: number;
  step1Claimed: boolean;
  step1Coins: number;
  step1ClaimedAt?: Date;
  step1RewardStatus: Step1RewardStatus;
  step2Claimed: boolean;
  step2Coins: number;
  step2ClaimedAt?: Date;
  step2RewardStatus: Step2RewardStatus;
  totalCallSeconds: number;
  riskLevel: RiskLevel;
  riskFlags: string[];
  reviewStatus: ReviewStatus;
  lastReconciledAt?: Date;
  reconciliationCount?: number;
  status: string;
  claimedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const referralSchema = new Schema<IReferral>(
  {
    referrer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    referee: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    referralCode: { type: String, required: true, uppercase: true, trim: true },
    referrerReward: { type: Number, default: 25 },
    refereeReward: { type: Number, default: 100 },
    step1Claimed: { type: Boolean, default: true },
    step1Coins: { type: Number, default: 25 },
    step1ClaimedAt: { type: Date, default: Date.now },
    step1RewardStatus: {
      type: String,
      enum: ['NOT_STARTED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'COMPLETED',
    },
    step2Claimed: { type: Boolean, default: false },
    step2Coins: { type: Number, default: 0 },
    step2ClaimedAt: { type: Date },
    step2RewardStatus: {
      type: String,
      enum: ['NOT_STARTED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'NOT_STARTED',
    },
    totalCallSeconds: { type: Number, default: 0 },
    riskLevel: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'LOW',
    },
    riskFlags: [{ type: String }],
    reviewStatus: {
      type: String,
      enum: ['PASSED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'],
      default: 'PASSED',
    },
    lastReconciledAt: { type: Date },
    reconciliationCount: { type: Number, default: 0 },
    status: { type: String, default: 'STEP1_CLAIMED' },
    claimedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

referralSchema.index({ referrer: 1, createdAt: -1 });
referralSchema.index({ referralCode: 1 });
referralSchema.index({ totalCallSeconds: 1, step2RewardStatus: 1 });
referralSchema.index({ riskLevel: 1, reviewStatus: 1 });

export const Referral = mongoose.model<IReferral>('Referral', referralSchema);
