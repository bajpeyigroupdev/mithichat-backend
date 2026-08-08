import mongoose, { Schema, Document } from 'mongoose';
import { RechargeType } from '../constants/user';

export interface IRechargeHistory extends Document {
  userId: number;                        // User who recharged
  sellerId?: number;                     // Seller (if offline)
  type: RechargeType;                    // Recharge type
  coins: number;                         // Coins recharged (legacy)
  diamonds?: number;                     // Diamonds recharged
  date: Date;                            // Recharge date
  transactionId?: string;                // Purchase token or order ID
  purchaseToken?: string;                // Primary idempotency key for Google Play
  productId?: string;                    // Google Play product ID (e.g., diamonds_800)
  packageName?: string;                  // Android app package name
  amount?: number;                       // Purchase price in INR
  currency?: string;                     // Currency code (e.g., INR)
  status?: string;                       // Transaction status: COMPLETED, PENDING, FAILED, REFUNDED
  orderId?: string;                      // Google Play GPA order ID
  processedAt?: Date;                    // Verification/credit timestamp
  rawGoogleData?: Record<string, any>;   // Verified payload snapshot
}

const rechargeHistorySchema = new Schema<IRechargeHistory>(
  {
    userId: { type: Number, required: true },
    sellerId: { type: Number, required: function () { return this.type === RechargeType.OFFLINE; } },
    type: {
      type: String,
      enum: Object.values(RechargeType),
      required: true,
    },
    coins: { type: Number, default: 0 },
    diamonds: { type: Number, default: 0 },
    date: { type: Date, default: Date.now },
    transactionId: { type: String, unique: true, sparse: true },
    purchaseToken: { type: String, unique: true, sparse: true },
    productId: { type: String },
    packageName: { type: String },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    status: { type: String, default: 'COMPLETED' },
    orderId: { type: String },
    processedAt: { type: Date, default: Date.now },
    rawGoogleData: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// Indexes for high performance and idempotency
rechargeHistorySchema.index({ userId: 1, date: -1 });
rechargeHistorySchema.index({ type: 1, date: -1 });
rechargeHistorySchema.index({ purchaseToken: 1 }, { unique: true, sparse: true });

export const RechargeHistory = mongoose.model<IRechargeHistory>(
  'RechargeHistory',
  rechargeHistorySchema
);
