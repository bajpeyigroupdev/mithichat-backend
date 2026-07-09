import mongoose, { Schema, Document } from 'mongoose';

export interface IRoom extends Document {
    title: string;
    channelName: string;
    ownerId: mongoose.Types.ObjectId;
    isLocked: boolean;
    category: string;
    tags: string[];
    members: mongoose.Types.ObjectId[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const RoomSchema = new Schema<IRoom>({
    title: { type: String, required: true },
    channelName: { type: String, required: true, unique: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isLocked: { type: Boolean, default: false },
    category: { type: String, default: 'General' },
    tags: [{ type: String }],
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

RoomSchema.index({ ownerId: 1 });
RoomSchema.index({ channelName: 1 });
RoomSchema.index({ category: 1, isActive: 1 });

export const Room = mongoose.model<IRoom>('Room', RoomSchema);
