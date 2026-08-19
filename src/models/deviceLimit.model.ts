import mongoose, { Schema, Document } from 'mongoose';

export interface IDeviceLimit extends Document {
  deviceId: string;
  maxAllowedAccounts: number;
  note?: string;
  updatedBy?: mongoose.Types.ObjectId;
}

const deviceLimitSchema = new Schema<IDeviceLimit>(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    maxAllowedAccounts: { type: Number, default: 1, min: 0 },
    note: { type: String, default: '' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const DeviceLimit = mongoose.model<IDeviceLimit>('DeviceLimit', deviceLimitSchema);
