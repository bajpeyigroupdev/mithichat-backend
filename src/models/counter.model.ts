import mongoose, { Schema, Document } from 'mongoose';

export interface ICounter extends Document {
  modelName: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  modelName: { type: String, required: true, unique: true },
  seq: { type: Number, default: 100000 }
});

export const Counter = mongoose.model<ICounter>('Counter', counterSchema);
