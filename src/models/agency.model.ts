import mongoose, { Schema, Document } from 'mongoose';

export interface IAgency extends Document {
    name: string;
    code: string;
    ownerId: mongoose.Types.ObjectId;
    commissionRate: number;
    balance: number;
    status: 'active' | 'blocked';
    createdAt: Date;
    updatedAt: Date;
}

const AgencySchema = new Schema<IAgency>({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    commissionRate: { type: Number, required: true, default: 10 }, // Agency percentage
    balance: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'blocked'], default: 'active' }
}, { timestamps: true });

AgencySchema.index({ ownerId: 1 });

export const Agency = mongoose.model<IAgency>('Agency', AgencySchema);
