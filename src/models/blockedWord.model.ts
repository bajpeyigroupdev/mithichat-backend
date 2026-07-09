import mongoose, { Schema, Document } from 'mongoose';

export interface IBlockedWord extends Document {
    word: string;
    createdAt: Date;
}

const BlockedWordSchema = new Schema<IBlockedWord>({
    word: { type: String, required: true, unique: true, lowercase: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

export const BlockedWord = mongoose.model<IBlockedWord>('BlockedWord', BlockedWordSchema);
