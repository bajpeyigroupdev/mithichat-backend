import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/umang";

async function runCleanupAndFix() {
  console.log("==================================================");
  console.log("🚀 STARTING TEST USER CLEANUP & 10-DIGIT ID MIGRATION");
  console.log("==================================================");

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB:", MONGO_URI.substring(0, 35) + "...");

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Failed to get MongoDB handle.");
    }

    const userCollection = db.collection("users");
    const counterCollection = db.collection("counters");
    const hostCollection = db.collection("hosts");

    const totalBefore = await userCollection.countDocuments({});
    console.log(`🔍 Total users before cleanup: ${totalBefore}`);

    // Step 1: Delete test / dummy accounts
    const testFilter = {
      $or: [
        { name: { $regex: "^(User|Host)\\d+$", $options: "i" } },
        { name: { $regex: "^Test(User|Host)", $options: "i" } },
        { "device.createdDeviceId": { $regex: "^test_dev_" } },
        { userName: { $regex: "^(User|Host|TestUser|TestHost)_\\d+" } }
      ]
    };

    const dummyUsers = await userCollection.find(testFilter).toArray();
    const dummyUserIds = dummyUsers.map(u => u.userId).filter(Boolean);
    const dummyObjIds = dummyUsers.map(u => u._id);

    console.log(`📌 Found ${dummyUsers.length} dummy test users to delete.`);

    if (dummyObjIds.length > 0) {
      await userCollection.deleteMany({ _id: { $in: dummyObjIds } });
      await hostCollection.deleteMany({ userId: { $in: dummyUserIds } });
      console.log(`✅ Deleted ${dummyObjIds.length} dummy test user records.`);
    }

    const totalAfterDelete = await userCollection.countDocuments({});
    console.log(`📊 Users remaining after cleanup: ${totalAfterDelete}`);

    // Step 2: Ensure 10-digit IDs for all remaining users
    const allRemainingUsers = await userCollection.find({}).sort({ createdAt: 1 }).toArray();
    
    // Find highest 10-digit ID among existing valid users
    let max10DigitSeq = 1000000000;
    for (const u of allRemainingUsers) {
      if (u.userId && typeof u.userId === 'number' && u.userId >= 1000000000 && u.userId <= 9999999999) {
        if (u.userId > max10DigitSeq) {
          max10DigitSeq = u.userId;
        }
      }
    }

    let non10DigitCount = 0;
    let currentSeq = max10DigitSeq;

    for (const u of allRemainingUsers) {
      const is10Digit = u.userId && typeof u.userId === 'number' && u.userId >= 1000000000 && u.userId <= 9999999999;
      
      if (!is10Digit) {
        currentSeq++;
        const new10DigitUserId = currentSeq;
        const oldUserId = u.userId;

        await userCollection.updateOne(
          { _id: u._id },
          { 
            $set: { 
              userId: new10DigitUserId,
              meethiId: String(new10DigitUserId)
            } 
          }
        );

        if (oldUserId) {
          await hostCollection.updateMany(
            { hostId: oldUserId },
            { $set: { hostId: new10DigitUserId, meethiId: String(new10DigitUserId) } }
          );
        }

        non10DigitCount++;
      } else if (!u.meethiId || u.meethiId !== String(u.userId)) {
        await userCollection.updateOne(
          { _id: u._id },
          { $set: { meethiId: String(u.userId) } }
        );
      }
    }

    console.log(`✅ Updated ${non10DigitCount} users to 10-digit User IDs.`);
    console.log(`🔢 Highest 10-digit User ID in database: ${currentSeq}`);

    // Step 3: Update Counter sequence in MongoDB
    const finalNextSeq = Math.max(currentSeq, 1000000336);
    await counterCollection.updateOne(
      { modelName: "user" },
      { $set: { seq: finalNextSeq } },
      { upsert: true }
    );
    console.log(`✅ Updated 'user' Counter sequence in MongoDB to: ${finalNextSeq}`);

    console.log("==================================================");
    console.log("🎉 CLEANUP AND 10-DIGIT MIGRATION COMPLETE!");
    console.log("==================================================");

  } catch (err: any) {
    console.error("❌ Cleanup script failed:", err?.message || err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected.");
  }
}

runCleanupAndFix();
