import mongoose, { Schema, Document } from 'mongoose';

export interface IReferral extends Document {
  referrer: mongoose.Types.ObjectId;
  referee: mongoose.Types.ObjectId;
  referralCode: string;
  referrerReward: number;
  refereeReward: number;
  step1Claimed: boolean;
  step1Coins: number;
  step1ClaimedAt?: Date;
  step2Claimed: boolean;
  step2Coins: number;
  step2ClaimedAt?: Date;
  totalCallSeconds: number;
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
    step2Claimed: { type: Boolean, default: false },
    step2Coins: { type: Number, default: 0 },
    step2ClaimedAt: { type: Date },
    totalCallSeconds: { type: Number, default: 0 },
    status: { type: String, default: 'STEP1_CLAIMED' },
    claimedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

referralSchema.index({ referrer: 1, createdAt: -1 });
referralSchema.index({ referee: 1 }, { unique: true });
referralSchema.index({ referralCode: 1 });

export const Referral = mongoose.model<IReferral>('Referral', referralSchema);
