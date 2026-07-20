import mongoose, { Schema, Document } from 'mongoose';

export interface IDocumentCenter extends Document {
    folderName: string;
    fileName: string;
    version: number;
    url: string;
    ownerId: mongoose.Types.ObjectId;
    visibility: 'public' | 'internal' | 'restricted';
    expiryDate?: Date;
    digitalSignature?: {
        signedBy: string;
        signedAt: Date;
        hash: string;
    };
    createdAt: Date;
}

const DocumentCenterSchema = new Schema<IDocumentCenter>({
    folderName: { type: String, required: true, default: 'General', index: true },
    fileName: { type: String, required: true, trim: true },
    version: { type: Number, required: true, default: 1 },
    url: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    visibility: {
        type: String,
        enum: ['public', 'internal', 'restricted'],
        default: 'internal'
    },
    expiryDate: { type: Date },
    digitalSignature: {
        signedBy: { type: String, default: '' },
        signedAt: { type: Date },
        hash: { type: String, default: '' }
    }
}, { timestamps: { createdAt: true, updatedAt: false } });

export const DocumentCenter = mongoose.model<IDocumentCenter>('DocumentCenter', DocumentCenterSchema);
