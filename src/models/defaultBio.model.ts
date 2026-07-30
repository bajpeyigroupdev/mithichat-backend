import mongoose, { Document, Schema } from 'mongoose';

export interface IDefaultBio extends Document {
    text: string;
    audience: 'host';
    isActive: boolean;
    sortOrder: number;
    createdBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const defaultBioSchema = new Schema<IDefaultBio>({
    text: { type: String, required: true, trim: true, maxlength: 100, unique: true },
    audience: { type: String, enum: ['host'], default: 'host' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

defaultBioSchema.index({ audience: 1, isActive: 1, sortOrder: 1 });

export const DefaultBio = mongoose.model<IDefaultBio>('DefaultBio', defaultBioSchema);

const defaultBioSeedStateSchema = new Schema({
    key: { type: String, unique: true, required: true },
    initialized: { type: Boolean, default: false },
}, { timestamps: true });

export const DefaultBioSeedState = mongoose.model('DefaultBioSeedState', defaultBioSeedStateSchema);
