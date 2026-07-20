import mongoose, { Schema, Document } from 'mongoose';

export interface IDocumentVersion extends Document {
    entityId: string; // UserId or ApplicationId
    documentType: 'Resume' | 'PAN' | 'Aadhaar' | 'GST' | 'NDA' | 'Agreement' | 'Certificate';
    version: number;
    url: string;
    uploadedBy: mongoose.Types.ObjectId;
    changeNotes?: string;
    createdAt: Date;
}

const DocumentVersionSchema = new Schema<IDocumentVersion>({
    entityId: { type: String, required: true, index: true },
    documentType: {
        type: String,
        required: true,
        enum: ['Resume', 'PAN', 'Aadhaar', 'GST', 'NDA', 'Agreement', 'Certificate'],
        index: true
    },
    version: { type: Number, required: true, default: 1 },
    url: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changeNotes: { type: String, default: '' }
}, { timestamps: { createdAt: true, updatedAt: false } });

DocumentVersionSchema.index({ entityId: 1, documentType: 1, version: -1 });

export const DocumentVersion = mongoose.model<IDocumentVersion>('DocumentVersion', DocumentVersionSchema);
