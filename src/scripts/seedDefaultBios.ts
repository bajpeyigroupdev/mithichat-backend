import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { DefaultBio } from "../models/defaultBio.model";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/umang";

const INITIAL_BIOS = [
  "Love to make new friends ❤️",
  "Always positive 😊",
  "Voice is my superpower 🎤",
  "Let's have a great conversation 💬",
  "Music Lover 🎶",
  "Traveller ✈️",
  "Dream Big 🌟",
  "Good Vibes Only 😄",
  "Friendly & Honest 🤝",
  "Here to Enjoy Life ❤️"
];

async function seedBios() {
  console.log("==================================================");
  console.log("🌱 SEEDING DEFAULT BIOS");
  console.log("==================================================");

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB:", MONGO_URI);

    let index = 1;
    for (const text of INITIAL_BIOS) {
      await DefaultBio.findOneAndUpdate(
        { text },
        {
          text,
          audience: "host",
          isActive: true,
          sortOrder: index++,
        },
        { upsert: true, new: true }
      );
    }

    console.log(`✅ Successfully seeded ${INITIAL_BIOS.length} professional default bios!`);
    console.log("==================================================");
  } catch (err: any) {
    console.error("❌ Bio seeding failed:", err?.message || err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected.");
  }
}

seedBios();
