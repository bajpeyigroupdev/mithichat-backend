import mongoose, { Schema, Document } from 'mongoose';
import { RechargeType } from '../constants/user';



export interface IRechargeHistory extends Document {
  userId: number;                        // User who recharged
  sellerId?: number;                     // Seller (if offline)
  type: RechargeType;                    // Recharge type
  coins: number;                         // Coins recharged
  diamonds?: number;                     // Diamonds recharged
  date: Date;                             // Recharge date
  transactionId?: string;                 // Google/Apple Transaction ID
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
    transactionId: { type: String, unique: true, sparse: true }, // Sparse: allowed to be null/missing
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes for performance
rechargeHistorySchema.index({ userId: 1, date: -1 }); // User recharge history
rechargeHistorySchema.index({ type: 1, date: -1 }); // Recharge type filtering

export const RechargeHistory = mongoose.model<IRechargeHistory>(
  'RechargeHistory',
  rechargeHistorySchema
);
