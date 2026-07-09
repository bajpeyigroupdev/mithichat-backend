import mongoose, { Schema, Document } from 'mongoose';

export interface IAd extends Document {
    title: string;
    type: 'banner' | 'native' | 'interstitial' | 'rewarded';
    provider: 'admob' | 'facebook';
    adUnitId: string;
    isActive: boolean;
    priority: number;
    createdAt: Date;
    updatedAt: Date;
}

const AdSchema = new Schema<IAd>({
    title: { type: String, required: true },
    type: { type: String, enum: ['banner', 'native', 'interstitial', 'rewarded'], required: true },
    provider: { type: String, enum: ['admob', 'facebook'], default: 'admob' },
    adUnitId: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 }
}, { timestamps: true });

AdSchema.index({ type: 1, isActive: 1 });

export const Ad = mongoose.model<IAd>('Ad', AdSchema);
