import mongoose from 'mongoose';
import { User } from '../models/user.model';
import { config } from '../configs/envConfig';

async function run() {
  try {
    await mongoose.connect(config.MONGO_URI as string);
    console.log("Connected to DB successfully!");

    // Search by name "Mithi Voice Chat" or by role "host"
    const hostUser = await User.findOne({ name: /Mithi Voice Chat/i }).lean();
    if (hostUser) {
      console.log("Host User found by name:", JSON.stringify(hostUser, null, 2));
    } else {
      console.log("No user found by name 'Mithi Voice Chat'");
      // Let's find any host
      const anyHost = await User.findOne({ role: 'host' }).lean();
      if (anyHost) {
        console.log("Found any host user:", JSON.stringify(anyHost, null, 2));
      } else {
        console.log("No hosts found at all!");
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("Error connecting or querying:", error);
    process.exit(1);
  }
}

run();
