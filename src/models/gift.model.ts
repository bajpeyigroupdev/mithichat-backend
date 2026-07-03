
import mongoose, { Schema, Document } from 'mongoose';

export interface IGift extends Document {
    name: string;
    icon: string; // URL of the gift icon
    cost: number; // Cost in coins
    category?: string;
    isActive: boolean;
}

const giftSchema = new Schema<IGift>(
    {
        name: { type: String, required: true },
        icon: { type: String, required: true },
        cost: { type: Number, required: true },
        category: { type: String, default: 'Standard' },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export const Gift = mongoose.model<IGift>('Gift', giftSchema);
