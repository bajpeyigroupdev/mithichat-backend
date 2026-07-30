import mongoose, { Schema, Document, model } from 'mongoose';

export enum AvatarRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export interface IAvatarRequest extends Document {
  hostId: number;
  hostUserObjId: mongoose.Types.ObjectId;
  currentAvatar: string;
  requestedAvatar: string;
  status: AvatarRequestStatus;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  rejectReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AvatarRequestSchema = new Schema<IAvatarRequest>(
  {
    hostId: { type: Number, required: true },
    hostUserObjId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    currentAvatar: { type: String, required: true },
    requestedAvatar: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(AvatarRequestStatus),
      default: AvatarRequestStatus.PENDING,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectReason: { type: String, default: '' },
  },
  { timestamps: true }
);

AvatarRequestSchema.index({ hostId: 1, status: 1 });

export default model<IAvatarRequest>('AvatarRequest', AvatarRequestSchema);
