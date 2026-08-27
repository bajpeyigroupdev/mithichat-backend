import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { User } from "../models/user.model";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/umang";

export const DEFAULT_FEMALE_AVATAR_URL = "https://api.mithichat.live/uploads/avatars/female_default.webp";
export const DEFAULT_MALE_AVATAR_URL = "https://api.mithichat.live/uploads/avatars/male_default.webp";
export const DEFAULT_NEUTRAL_AVATAR_URL = "https://api.mithichat.live/uploads/avatars/neutral_default.webp";

export function isValidAvatarUrl(url: any): boolean {
  if (!url || typeof url !== 'string') return false;
  const str = url.trim();
  if (
    str === '' ||
    str.toLowerCase() === 'null' ||
    str.toLowerCase() === 'undefined' ||
    str.toLowerCase().includes('placeholder')
  ) {
    return false;
  }

  const lower = str.toLowerCase();
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:image/') ||
    lower.startsWith('/uploads/') ||
    lower.startsWith('/avatars/')
  ) {
    return true;
  }

  return false;
}

export function isLegacyPresetAvatarUrl(url: any): boolean {
  if (!url || typeof url !== 'string') return true;
  const lower = url.trim().toLowerCase();
  if (
    lower.includes('uploads/avatars/205766/') ||
    lower.includes('uploads/avatars/582737/') ||
    lower.includes('dinjtxdtj/image/upload/') ||
    lower.includes('728327_avatars') ||
    lower.includes('1000000001_avatars') ||
    lower.includes('default_female') ||
    lower.includes('default_male') ||
    lower.includes('default_neutral')
  ) {
    return true;
  }
  return false;
}

export function getDefaultAvatarUrlByGender(gender: any): string {
  if (!gender || typeof gender !== 'string') return DEFAULT_NEUTRAL_AVATAR_URL;
  const g = gender.trim().toLowerCase();
  if (g === 'female' || g === 'f' || g === 'girl' || g === 'woman' || g === 'lady') {
    return DEFAULT_FEMALE_AVATAR_URL;
  }
  if (g === 'male' || g === 'm' || g === 'boy' || g === 'man') {
    return DEFAULT_MALE_AVATAR_URL;
  }
  return DEFAULT_NEUTRAL_AVATAR_URL;
}

export async function populateDefaultAvatarsForExistingUsers() {
  console.log("==================================================");
  console.log("🖼️ POPULATING DEFAULT GENDER AVATARS FOR EXISTING USERS");
  console.log("==================================================");

  try {
    const users = await User.find({ isDeleted: false }).select("userId name gender image").lean();
    console.log(`🔍 Found ${users.length} total users in DB. Processing avatars...`);

    let updatedCount = 0;
    let skippedCustomCount = 0;

    for (const u of users) {
      const isCustomValid = isValidAvatarUrl(u.image) && !isLegacyPresetAvatarUrl(u.image);

      if (isCustomValid) {
        skippedCustomCount++;
        continue;
      }

      const defaultAvatar = getDefaultAvatarUrlByGender(u.gender);
      if (u.image !== defaultAvatar) {
        await User.updateOne(
          { _id: u._id },
          { $set: { image: defaultAvatar } }
        );
        updatedCount++;
      } else {
        skippedCustomCount++;
      }
    }

    console.log(`✅ Default Avatar Population Complete!`);
    console.log(`   - Updated ${updatedCount} users with correct gender default avatars.`);
    console.log(`   - Preserved ${skippedCustomCount} users with valid custom/correct avatars.`);
  } catch (error) {
    console.error("❌ Error populating default avatars:", error);
  }
}

// Allow direct CLI script execution
if (require.main === module) {
  mongoose.connect(MONGO_URI).then(async () => {
    console.log("✅ Connected to MongoDB:", MONGO_URI);
    await populateDefaultAvatarsForExistingUsers();
    await mongoose.disconnect();
    console.log("👋 Disconnected from DB.");
    process.exit(0);
  }).catch((err) => {
    console.error("❌ DB connection error:", err);
    process.exit(1);
  });
}
