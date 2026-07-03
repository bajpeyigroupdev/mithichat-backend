import mongoose, { Schema, Document } from "mongoose";
import { generateOtp } from "../utils/otp";


// Define the structure of the OTP document
interface IOtp extends Document {
  userId: Number;
  otp: Number;
  createdAt: Date;
}

// Mongoose Schema
const OtpSchema = new Schema<IOtp>(
  {
    userId: { type: Number, unique: false }, // User email
    otp: { type: Number, required: true }, // OTP Code
    createdAt: { type: Date, default: Date.now, expires: 600 }, // TTL index (10 minutes)
  },
  { timestamps: true }
);

// Create a model from the schema
const OtpModel = mongoose.model<IOtp>("Otp", OtpSchema);

export default OtpModel;
