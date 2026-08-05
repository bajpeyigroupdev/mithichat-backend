import mongoose, { Schema, Document } from 'mongoose';

export interface ISellerPricingConfig extends Document {
    configKey: string;
    userDiamondsPerRupee: number;       // Base User rate: 16.7 diamonds / ₹1 INR
    sellerDiscountFactor: number;       // Seller discount factor: 0.95 (5% discount)
    sellerCostPer1670Diamonds: number;  // ₹95 for 1,670 💎
    customerPricePer1670Diamonds: number; // ₹100 for 1,670 💎
    minRechargeDiamonds: number;
    isActive: boolean;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const SellerPricingConfigSchema = new Schema<ISellerPricingConfig>(
    {
        configKey: { type: String, required: true, unique: true, default: 'DEFAULT_SELLER_PRICING' },
        userDiamondsPerRupee: { type: Number, required: true, default: 16.7 },
        sellerDiscountFactor: { type: Number, required: true, default: 0.95 },
        sellerCostPer1670Diamonds: { type: Number, required: true, default: 95 },
        customerPricePer1670Diamonds: { type: Number, required: true, default: 100 },
        minRechargeDiamonds: { type: Number, default: 10 },
        isActive: { type: Boolean, default: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
    },
    { timestamps: true }
);

export const SellerPricingConfig = mongoose.model<ISellerPricingConfig>('SellerPricingConfig', SellerPricingConfigSchema);
