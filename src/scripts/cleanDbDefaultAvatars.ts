import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { User } from '../models/user.model';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/umang';

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const result = await User.updateMany(
      {
        image: {
          $in: [
            'https://api.mithichat.live/uploads/avatars/male_default.webp',
            'https://api.mithichat.live/uploads/avatars/female_default.webp',
            'https://api.mithichat.live/uploads/avatars/neutral_default.webp',
            '/uploads/avatars/female_default.webp',
            '/uploads/avatars/male_default.webp',
            '/uploads/avatars/neutral_default.webp'
          ]
        }
      },
      { $set: { image: '' } }
    );

    console.log(`Successfully cleaned up ${result.modifiedCount} users with 404 avatar URLs.`);
    process.exit(0);
  } catch (err) {
    console.error('Error cleaning DB default avatars:', err);
    process.exit(1);
  }
}

run();
