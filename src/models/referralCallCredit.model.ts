import mongoose, { Schema, Document } from 'mongoose';

export type CallCreditStatus = 'PENDING' | 'PROCESSING' | 'APPLIED' | 'FAILED';

export interface IReferralCallCredit extends Document {
  referralId: mongoose.Types.ObjectId;
  callId: mongoose.Types.ObjectId | string;
  refereeUserId: mongoose.Types.ObjectId;
  durationSeconds: number;
  status: CallCreditStatus;
  processedAt: Date;
  appliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const referralCallCreditSchema = new Schema<IReferralCallCredit>(
  {
    referralId: { type: Schema.Types.ObjectId, ref: 'Referral', required: true },
    callId: { type: Schema.Types.Mixed, required: true },
    refereeUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    durationSeconds: { type: Number, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'APPLIED', 'FAILED'],
      default: 'PROCESSING',
    },
    processedAt: { type: Date, default: Date.now },
    appliedAt: { type: Date },
  },
  { timestamps: true }
);

// Authoritative Database-Level Unique Compound Index
referralCallCreditSchema.index({ referralId: 1, callId: 1 }, { unique: true });

// State query index for fast reconciliation lookup
referralCallCreditSchema.index({ status: 1, createdAt: 1 });

// 90-Day Retention Policy TTL Index (7,776,000 seconds)
referralCallCreditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export const ReferralCallCredit = mongoose.model<IReferralCallCredit>(
  'ReferralCallCredit',
  referralCallCreditSchema
);
