import mongoose, { Schema, Document, model } from 'mongoose';

// Interface for Avatar document
export interface IAvatar extends Document {          
  gender: 'male' | 'female';
  avatarUrl: string;            
}

// Mongoose schema
const AvatarSchema: Schema<IAvatar> = new Schema<IAvatar>({
  gender: {
    type: String,
    enum: ['male', 'female'],
    required: true,
  },
  avatarUrl: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,                
});

// Export model
export default model<IAvatar>('Avatar', AvatarSchema);
