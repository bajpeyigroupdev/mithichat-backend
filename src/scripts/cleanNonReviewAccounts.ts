import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/umang";

/**
 * CLEAN NON-REVIEW ACCOUNTS SCRIPT
 * Preserves ONLY Review Accounts (role: 'review' or review test accounts).
 * Removes all other User and Host accounts and their transient data from the database.
 */

async function cleanAccounts() {
  console.log("==================================================");
  console.log("🧹 STARTING DATABASE CLEANUP (PRESERVING REVIEW ACCOUNTS)");
  console.log("==================================================");

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB:", MONGO_URI);

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Failed to get MongoDB handle.");
    }

    const userCollection = db.collection("users");
    const hostCollection = db.collection("hosts");

    // 1. Identify Review Accounts to keep
    const reviewUsers = await userCollection.find({
      $or: [
        { role: "review" },
        { email: { $regex: "review", $options: "i" } },
        { isReviewAccount: true },
        { phoneNumber: "9999999999" } // Keep Super Admin if present
      ]
    }).toArray();

    const reviewUserObjectIds = reviewUsers.map(u => u._id);
    const reviewUserNumericIds = reviewUsers.map(u => u.userId).filter(Boolean);

    console.log(`📌 Preserving ${reviewUsers.length} Review Account(s):`, reviewUsers.map(u => u.phoneNumber || u.email || u.userId));

    // 2. Delete non-review users
    const deleteUsersResult = await userCollection.deleteMany({
      _id: { $nin: reviewUserObjectIds }
    });
    console.log(`🗑️ Deleted ${deleteUsersResult.deletedCount} non-review User accounts.`);

    // 3. Delete non-review hosts
    const deleteHostsResult = await hostCollection.deleteMany({
      $or: [
        { hostId: { $nin: reviewUserNumericIds } },
        { meethiId: { $nin: reviewUserNumericIds.map(id => String(id)) } }
      ]
    });
    console.log(`🗑️ Deleted ${deleteHostsResult.deletedCount} Host records.`);

    // 4. Clean associated transient collections for deleted users
    const transientCollections = [
      "withdrawals", "rechargehistories", "spentcoins", "transferhistories",
      "chats", "conversations", "livehistories", "reports", "notifications",
      "verifications", "kycs", "deletionrequests", "auditlogs", "loginhistories"
    ];

    for (const collName of transientCollections) {
      const coll = db.collection(collName);
      const res = await coll.deleteMany({
        $and: [
          { userId: { $nin: reviewUserNumericIds } },
          { userId: { $exists: true } }
        ]
      });
      console.log(`🧹 Cleaned ${res.deletedCount} records from ${collName}.`);
    }

    console.log("==================================================");
    console.log("🎉 DATABASE ACCOUNT CLEANUP COMPLETE!");
    console.log("==================================================");

  } catch (err: any) {
    console.error("❌ Cleanup failed:", err?.message || err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected.");
  }
}

cleanAccounts();
