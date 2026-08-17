import mongoose, { Schema, Document } from 'mongoose';

export interface IBanner extends Document {
    title: string;
    imageUrl: string;
    linkUrl: string;
    targetType: 'none' | 'internal' | 'external';
    targetScreen: string;
    priority: number;
    startDate?: Date;
    endDate?: Date;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const BannerSchema = new Schema<IBanner>({
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkUrl: { type: String, default: '' },
    targetType: { type: String, enum: ['none', 'internal', 'external'], default: 'none' },
    targetScreen: { type: String, default: '', trim: true },
    priority: { type: Number, default: 0 },
    startDate: { type: Date },
    endDate: { type: Date },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

BannerSchema.index({ isActive: 1, priority: -1, createdAt: -1 });

export const Banner = mongoose.model<IBanner>('Banner', BannerSchema);
