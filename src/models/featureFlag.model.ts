import mongoose, { Schema, Document } from 'mongoose';

export interface IFeatureFlag extends Document {
    key: string;
    title: string;
    description?: string;
    isEnabled: boolean;
    allowedRoles?: string[];
    updatedBy?: mongoose.Types.ObjectId;
    updatedAt: Date;
}

const FeatureFlagSchema = new Schema<IFeatureFlag>({
    key: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    isEnabled: { type: Boolean, default: true },
    allowedRoles: [{ type: String }],
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export const FeatureFlag = mongoose.model<IFeatureFlag>('FeatureFlag', FeatureFlagSchema);
