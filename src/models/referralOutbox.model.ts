import mongoose, { Schema, Document } from 'mongoose';

export type OutboxStatus = 'PENDING' | 'DELIVERED' | 'FAILED';

export interface IReferralOutbox extends Document {
  referralId: mongoose.Types.ObjectId;
  type: 'STEP1_NOTIFICATION' | 'STEP2_NOTIFICATION';
  payload: Record<string, any>;
  status: OutboxStatus;
  attempts: number;
  error?: string;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const referralOutboxSchema = new Schema<IReferralOutbox>(
  {
    referralId: { type: Schema.Types.ObjectId, ref: 'Referral', required: true },
    type: { type: String, enum: ['STEP1_NOTIFICATION', 'STEP2_NOTIFICATION'], required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'DELIVERED', 'FAILED'],
      default: 'PENDING',
    },
    attempts: { type: Number, default: 0 },
    error: { type: String },
    deliveredAt: { type: Date },
  },
  { timestamps: true }
);

referralOutboxSchema.index({ status: 1, createdAt: 1 });
referralOutboxSchema.index({ referralId: 1, type: 1 });

export const ReferralOutbox = mongoose.model<IReferralOutbox>(
  'ReferralOutbox',
  referralOutboxSchema
);
