import { Schema, model, Document } from "mongoose";

// TypeScript interface for Host
export interface IHost extends Document {
  hostId: number;
  meethiId: string;
  fullName: string;
  mobileNumber: string;
  emailId: string;
  introAudio?: string;
  idProof?: string;
  addressProof?: string;
  profilePhoto?: string;
  termsAccepted: boolean;
  isDeleted?: boolean;
  isApproved?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Mongoose schema
const HostSchema = new Schema<IHost>(
  {
    hostId: { type: Number, required: true, unique: true },
    meethiId: { type: String, required: true },
    fullName: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    emailId: { type: String, required: true, unique: true },
    introAudio: { type: String },
    idProof: { type: String },
    addressProof: { type: String },
    profilePhoto: { type: String },
    termsAccepted: { type: Boolean, required: true, default: false },
    isDeleted: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes for performance
HostSchema.index({ meethiId: 1 }); // Filter by Admin's ID
HostSchema.index({ isApproved: 1, isDeleted: 1 }); // Admin queries for active hosts

// Export model
const Host = model<IHost>("Host", HostSchema);
export default Host;
