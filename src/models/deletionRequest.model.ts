import mongoose, { Schema, Document } from "mongoose";

export interface IDeletionRequest extends Document {
  userId: mongoose.Types.ObjectId;
  meethiId: string;
  name: string;
  role: string;
  phoneNumber?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const deletionRequestSchema = new Schema<IDeletionRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    meethiId: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true },
    phoneNumber: { type: String },
    reason: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

export default mongoose.model<IDeletionRequest>("DeletionRequest", deletionRequestSchema);
