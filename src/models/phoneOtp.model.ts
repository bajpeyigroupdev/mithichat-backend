import mongoose, { Schema, Document } from "mongoose";

interface IPhoneOtp extends Document {
  phoneNumber: string;
  otp: string;
  attempts: number;
  createdAt: Date;
}

const PhoneOtpSchema = new Schema<IPhoneOtp>(
  {
    phoneNumber: { type: String, required: true, index: true },
    otp: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 600 }, // TTL: 10 minutes
  },
  { timestamps: false }
);

const PhoneOtpModel = mongoose.model<IPhoneOtp>("PhoneOtp", PhoneOtpSchema);

export default PhoneOtpModel;
