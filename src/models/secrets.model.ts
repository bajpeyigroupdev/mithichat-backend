import mongoose, { Schema, Document } from 'mongoose';

export interface ISecretVault extends Document {
    secretKey: string; // E.g., 'SMTP_PASSWORD', 'CLOUDINARY_SECRET', 'FIREBASE_KEY'
    encryptedValue: string;
    category: 'email' | 'storage' | 'payment' | 'push' | 'third_party';
    updatedBy?: mongoose.Types.ObjectId;
    updatedAt: Date;
}

const SecretVaultSchema = new Schema<ISecretVault>({
    secretKey: { type: String, required: true, unique: true, index: true },
    encryptedValue: { type: String, required: true },
    category: {
        type: String,
        enum: ['email', 'storage', 'payment', 'push', 'third_party'],
        default: 'third_party'
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export const SecretVault = mongoose.model<ISecretVault>('SecretVault', SecretVaultSchema);
