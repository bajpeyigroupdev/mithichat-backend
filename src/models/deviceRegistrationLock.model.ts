import mongoose, { Schema, Document } from 'mongoose';

export interface IDeviceRegistrationLock extends Document {
  deviceId: string;
  accountIndex: number;
  userId?: number;
}

const deviceRegistrationLockSchema = new Schema<IDeviceRegistrationLock>(
  {
    deviceId: { type: String, required: true, index: true },
    accountIndex: { type: Number, required: true },
    userId: { type: Number },
  },
  { timestamps: true }
);

// Compound Unique Index on deviceId + accountIndex to prevent race condition bypass
deviceRegistrationLockSchema.index({ deviceId: 1, accountIndex: 1 }, { unique: true });

export const DeviceRegistrationLock = mongoose.model<IDeviceRegistrationLock>(
  'DeviceRegistrationLock',
  deviceRegistrationLockSchema
);
