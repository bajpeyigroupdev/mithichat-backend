import mongoose, { Schema } from 'mongoose';
import { IPricePlan } from '../interfaces/coinsPrice.interface';

const pricePlanSchema = new Schema<IPricePlan>(
  {
    description: { type: String, required: true },
    actualPrice: { type: Number, required: true },
    discountedPrice: { type: Number, default: 0 },
    coins: { type: Number, required: true },

    // 👇 new field for plan type
    type: {
      type: String,
      enum: ["offline", "online"], // only 2 values allowed
      required: true,
    },
  },
  { timestamps: true }
);

export const PricePlan = mongoose.model<IPricePlan>(
  "PricePlan",
  pricePlanSchema
);
