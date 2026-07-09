import mongoose, { Schema, Document } from 'mongoose';

export interface IVipPlan extends Document {
    name: string;
    durationDays: number;
    coinsCost: number;
    price: number;
    benefits: string[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const VipPlanSchema = new Schema<IVipPlan>({
    name: { type: String, required: true },
    durationDays: { type: Number, required: true, default: 30 },
    coinsCost: { type: Number, required: true, default: 0 },
    price: { type: Number, required: true, default: 0.0 },
    benefits: [{ type: String }],
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

VipPlanSchema.index({ isActive: 1 });

export const VipPlan = mongoose.model<IVipPlan>('VipPlan', VipPlanSchema);
