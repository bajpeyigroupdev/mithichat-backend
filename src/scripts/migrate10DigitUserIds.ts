import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/umang";

/**
 * 10-DIGIT USER ID MIGRATION SCRIPT
 * Converts all existing user numeric IDs into sequential 10-digit IDs (1000000001, 1000000002, ...).
 * Keeps MongoDB _id unchanged and updates all foreign key references.
 */

async function migrateUserIds() {
  console.log("==================================================");
  console.log("🚀 STARTING 10-DIGIT USER ID MIGRATION");
  console.log("==================================================");

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB:", MONGO_URI);

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Failed to get MongoDB handle.");
    }

    const userCollection = db.collection("users");
    const counterCollection = db.collection("counters");
    const hostCollection = db.collection("hosts");

    let currentSeq = 1000000000;

    const allUsers = await userCollection.find({}).sort({ createdAt: 1 }).toArray();
    console.log(`🔍 Found ${allUsers.length} Users for 10-digit ID migration...`);

    const userIdMap = new Map<number, number>();

    for (const u of allUsers) {
      const oldUserId = u.userId;
      currentSeq++;
      const new10DigitUserId = currentSeq;

      if (oldUserId) {
        userIdMap.set(oldUserId, new10DigitUserId);
      }

      await userCollection.updateOne(
        { _id: u._id },
        { 
          $set: { 
            userId: new10DigitUserId,
            meethiId: String(new10DigitUserId)
          } 
        }
      );
    }
    console.log(`✅ Updated ${allUsers.length} Users with 10-digit User IDs.`);

    // Update Host records matching hostId
    for (const [oldId, newId] of userIdMap.entries()) {
      await hostCollection.updateMany(
        { hostId: oldId },
        { $set: { hostId: newId, meethiId: String(newId) } }
      );
    }

    // Update relational collections
    const collectionsToUpdate = [
      "withdrawals", "rechargehistories", "spentcoins", "transferhistories",
      "chats", "conversations", "livehistories", "reports", "notifications",
      "verifications", "kycs", "deletionrequests", "requests", "tasks"
    ];

    for (const collName of collectionsToUpdate) {
      const coll = db.collection(collName);
      for (const [oldId, newId] of userIdMap.entries()) {
        await coll.updateMany({ userId: oldId }, { $set: { userId: newId } });
        await coll.updateMany({ hostId: oldId }, { $set: { hostId: newId } });
      }
    }

    // Update Counter collection
    await counterCollection.updateOne(
      { modelName: "user_10digit" },
      { $set: { seq: currentSeq } },
      { upsert: true }
    );
    console.log(`✅ Counter 'user_10digit' updated to seq: ${currentSeq}`);

    console.log("==================================================");
    console.log("🎉 10-DIGIT USER ID MIGRATION COMPLETE!");
    console.log("==================================================");

  } catch (err: any) {
    console.error("❌ Migration failed:", err?.message || err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected.");
  }
}

migrateUserIds();
