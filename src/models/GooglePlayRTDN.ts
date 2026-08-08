import mongoose, { Schema, Document } from 'mongoose';

export type RTDNStatus = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

export interface IGooglePlayRTDN extends Document {
  messageId: string;
  packageName?: string;
  eventTimeMillis?: Date;
  notificationType?: string;
  purchaseToken?: string;
  status: RTDNStatus;
  processedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const googlePlayRTDNSchema = new Schema<IGooglePlayRTDN>(
  {
    messageId: { type: String, required: true, unique: true },
    packageName: { type: String },
    eventTimeMillis: { type: Date },
    notificationType: { type: String },
    purchaseToken: { type: String },
    status: {
      type: String,
      enum: ['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED'],
      default: 'RECEIVED',
    },
    processedAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true }
);

// Explicit unique index on messageId for multi-instance / PM2 cluster deduplication
googlePlayRTDNSchema.index({ messageId: 1 }, { unique: true });

export const GooglePlayRTDN = mongoose.model<IGooglePlayRTDN>(
  'GooglePlayRTDN',
  googlePlayRTDNSchema
);
