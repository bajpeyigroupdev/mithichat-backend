import mongoose, { Schema, Document } from 'mongoose';

export interface IReferral extends Document {
  referrer: mongoose.Types.ObjectId;
  referee: mongoose.Types.ObjectId;
  referralCode: string;
  referrerReward: number;
  refereeReward: number;
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
    referrerReward: { type: Number, default: 50 },
    refereeReward: { type: Number, default: 100 },
    status: { type: String, default: 'CLAIMED' },
    claimedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

referralSchema.index({ referrer: 1, createdAt: -1 });
referralSchema.index({ referee: 1 }, { unique: true });
referralSchema.index({ referralCode: 1 });

export const Referral = mongoose.model<IReferral>('Referral', referralSchema);
