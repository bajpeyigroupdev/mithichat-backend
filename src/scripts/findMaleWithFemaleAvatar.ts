import mongoose from 'mongoose';
import { User } from '../models/user.model';
import { config } from '../configs/envConfig';

async function run() {
  try {
    await mongoose.connect(config.MONGO_URI as string);
    console.log("Connected to DB successfully!");

    const maleUsers = await User.find({ gender: 'male', isDeleted: false }).select("userId name gender image role").lean();
    console.log(`Found ${maleUsers.length} total male users.`);

    // Group images for male users
    const imageMap = new Map<string, number>();
    maleUsers.forEach(u => {
      const img = u.image || '(NULL/EMPTY)';
      imageMap.set(img, (imageMap.get(img) || 0) + 1);
    });

    console.log("\nImage distribution for male users:");
    imageMap.forEach((count, img) => {
      console.log(`[Count: ${count}] Image: ${img}`);
    });

    console.log("\nSample 20 male users:");
    maleUsers.slice(0, 20).forEach(u => {
      console.log(`User #${u.userId} | ${u.name} | Role: ${u.role} | Gender: '${u.gender}' | Image: '${u.image}'`);
    });

    process.exit(0);
  } catch (error) {
    console.error("Error querying DB:", error);
    process.exit(1);
  }
}

run();
