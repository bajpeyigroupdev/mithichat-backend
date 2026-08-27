import mongoose from 'mongoose';
import { User } from '../models/user.model';
import { config } from '../configs/envConfig';

async function run() {
  try {
    await mongoose.connect(config.MONGO_URI as string);

    const usersWithCloudinary = await User.find({
      isDeleted: false,
      image: { $regex: 'cloudinary.com' }
    }).select("userId name gender image role").lean();

    console.log(`Found ${usersWithCloudinary.length} users with Cloudinary images:\n`);
    usersWithCloudinary.forEach(u => {
      console.log(`[#${u.userId}] Name: "${u.name}" | Gender: "${u.gender}" | Role: "${u.role}" | Image: ${u.image}`);
    });

    process.exit(0);
  } catch (error) {
    console.error("Error querying DB:", error);
    process.exit(1);
  }
}

run();
