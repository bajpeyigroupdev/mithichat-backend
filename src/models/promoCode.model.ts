import mongoose, { Schema, Document } from 'mongoose';

export interface IPromoCode extends Document {
    code: string;
    rewardCoins: number;
    usageLimit: number;
    usageCount: number;
    expiresAt?: Date;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const PromoCodeSchema = new Schema<IPromoCode>({
    code: { type: String, required: true, unique: true, uppercase: true },
    rewardCoins: { type: Number, required: true, default: 0 },
    usageLimit: { type: Number, required: true, default: 100 },
    usageCount: { type: Number, default: 0 },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

PromoCodeSchema.index({ isActive: 1 });

export const PromoCode = mongoose.model<IPromoCode>('PromoCode', PromoCodeSchema);
