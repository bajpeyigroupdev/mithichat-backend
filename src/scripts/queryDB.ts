import mongoose from 'mongoose';
import { User } from '../models/user.model';
import { config } from '../configs/envConfig';

async function run() {
  try {
    await mongoose.connect(config.MONGO_URI as string);

    const imagePatterns = await User.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: { gender: "$gender", image: "$image" }, count: { $sum: 1 } } }
    ]);
    console.log("Image & Gender Patterns in DB:", JSON.stringify(imagePatterns, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("Error querying DB:", error);
    process.exit(1);
  }
}

run();
