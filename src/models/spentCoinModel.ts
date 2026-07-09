import mongoose, { Schema, Document, Types } from "mongoose";
import { ICoinsTransaction } from '../interfaces/spentCoin';
import { CallStatus, TransactionType } from '../constants/user';

const coinsTransactionSchema = new Schema<ICoinsTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },  // 👈 ObjectId
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true },  // 👈 ObjectId

    type: {
      type: String,
      enum: Object.values(TransactionType),
      required: true,
    },

    // Common fields for all transactions
    coinsSpent: { type: Number },
    hostEarning: { type: Number },
    // Extra fields (only for VOICE_CALL)
    status: {
      type: String,
      enum: Object.values(CallStatus),
      default: CallStatus.PENDING,
    },
    lastHeartbeat: { type: Date },
    channelName: { type: String },
    meta: {
      type: Object,
      default: {}
    },

    // Extra fields (only for VOICE_CALL)
    callStart: { type: Date },
    callEnd: { type: Date },
    duration: { type: Number }, // in seconds or minutes
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes for performance
coinsTransactionSchema.index({ userId: 1, status: 1 }); // User transaction history
coinsTransactionSchema.index({ hostId: 1, status: 1 }); // Host earnings history
coinsTransactionSchema.index({ callStart: -1 }); // Rankings/leaderboards
coinsTransactionSchema.index({ userId: 1, type: 1, callStart: -1 }); // Filtered history queries

export const CoinsTransaction = mongoose.model<ICoinsTransaction>(
  'CoinsTransaction',
  coinsTransactionSchema
);
