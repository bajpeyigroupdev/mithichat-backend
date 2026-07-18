import mongoose from 'mongoose';
import HostLevel from '../models/hostLevel.model';
import { config } from '../configs/envConfig';

async function run() {
  try {
    await mongoose.connect(config.MONGO_URI as string);
    console.log("Connected to DB successfully!");

    const levels = await HostLevel.find({}).sort({ level: 1 }).lean();
    console.log("Host Levels count:", levels.length);
    console.log("Host Levels data:", JSON.stringify(levels, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("Error connecting or querying:", error);
    process.exit(1);
  }
}

run();
