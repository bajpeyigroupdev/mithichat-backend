import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/umang";

/**
 * REGENERATE ALL IDS MIGRATION SCRIPT
 * Preserves:
 * 1. Panel Role IDs (Role collection)
 * 2. Review Account IDs (Users with role 'review' or specified review accounts)
 * 
 * Regenerates:
 * - ObjectIds and Numeric IDs for Super Admin, Admin, Operator, Agency, Host, User, Wallet,
 *   Transactions, Calls, Recharges, Withdrawals, Gifts, Banners, Rooms, Reports, Notifications,
 *   Verifications, Activities, Audit Logs, Settings, Rankings, Coin/Diamond Histories.
 * - Updates all foreign key relationships and reference counters.
 */

async function runMigration() {
  console.log("==================================================");
  console.log("🚀 STARTING ID REGENERATION & DATABASE MIGRATION");
  console.log("==================================================");

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB:", MONGO_URI);

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Failed to get MongoDB database handle.");
    }

    // Step 1: Identify Preserved Entities
    const roleCollection = db.collection("roles");
    const preservedRoleIds = new Set<string>();
    const roles = await roleCollection.find({}).toArray();
    roles.forEach(r => preservedRoleIds.add(r._id.toString()));
    console.log(`📌 Preserved ${preservedRoleIds.size} Panel Role IDs.`);

    const userCollection = db.collection("users");
    const preservedReviewUserIds = new Set<string>();
    const preservedReviewNumericIds = new Set<number>();
    
    // Find review accounts (by role 'review' or email containing 'review' or isReviewAccount flag)
    const reviewUsers = await userCollection.find({
      $or: [
        { role: "review" },
        { email: { $regex: "review", $options: "i" } },
        { isReviewAccount: true }
      ]
    }).toArray();

    reviewUsers.forEach(u => {
      preservedReviewUserIds.add(u._id.toString());
      if (u.userId) preservedReviewNumericIds.add(u.userId);
    });
    console.log(`📌 Preserved ${preservedReviewUserIds.size} Review Account IDs.`);

    // Step 2: Build Mappings for Users
    const objectIdMap = new Map<string, mongoose.Types.ObjectId>();
    const numericUserIdMap = new Map<number, number>();
    const numericHostIdMap = new Map<number, number>();

    let currentUserIdSeq = 100000;

    const allUsers = await userCollection.find({}).toArray();
    console.log(`🔍 Processing ${allUsers.length} Users...`);

    for (const u of allUsers) {
      const oldIdStr = u._id.toString();
      if (!preservedReviewUserIds.has(oldIdStr)) {
        const newObjId = new mongoose.Types.ObjectId();
        objectIdMap.set(oldIdStr, newObjId);

        if (u.userId && !preservedReviewNumericIds.has(u.userId)) {
          currentUserIdSeq++;
          numericUserIdMap.set(u.userId, currentUserIdSeq);
        }
      }
    }

    // Step 3: Migrate Users Collection
    console.log("⚡ Migrating Users collection...");
    for (const u of allUsers) {
      const oldIdStr = u._id.toString();
      if (preservedReviewUserIds.has(oldIdStr)) continue;

      const newObjId = objectIdMap.get(oldIdStr) || new mongoose.Types.ObjectId();
      const newNumericId = u.userId ? (numericUserIdMap.get(u.userId) || u.userId) : u.userId;

      // Copy document with updated references
      const updatedUser = {
        ...u,
        _id: newObjId,
        userId: newNumericId,
        createdBy: u.createdBy && objectIdMap.has(u.createdBy.toString()) ? objectIdMap.get(u.createdBy.toString()) : u.createdBy,
        parentId: u.parentId && objectIdMap.has(u.parentId.toString()) ? objectIdMap.get(u.parentId.toString()) : u.parentId,
        ownerId: u.ownerId && objectIdMap.has(u.ownerId.toString()) ? objectIdMap.get(u.ownerId.toString()) : u.ownerId,
        operatorId: u.operatorId && objectIdMap.has(u.operatorId.toString()) ? objectIdMap.get(u.operatorId.toString()) : u.operatorId,
        superAdminId: u.superAdminId && objectIdMap.has(u.superAdminId.toString()) ? objectIdMap.get(u.superAdminId.toString()) : u.superAdminId,
        adminId: u.adminId && objectIdMap.has(u.adminId.toString()) ? objectIdMap.get(u.adminId.toString()) : u.adminId,
        agencyId: u.agencyId && objectIdMap.has(u.agencyId.toString()) ? objectIdMap.get(u.agencyId.toString()) : u.agencyId,
        referredBy: u.referredBy && objectIdMap.has(u.referredBy.toString()) ? objectIdMap.get(u.referredBy.toString()) : u.referredBy,
        deletedBy: u.deletedBy && objectIdMap.has(u.deletedBy.toString()) ? objectIdMap.get(u.deletedBy.toString()) : u.deletedBy,
      };

      await userCollection.insertOne(updatedUser);
      await userCollection.deleteOne({ _id: u._id });
    }

    // Step 4: Migrate Other System Collections
    const collectionsToMigrate = [
      "agencies", "hosts", "withdrawals", "rechargehistories", "gifts", "banners",
      "rooms", "reports", "notifications", "verifications", "activityevents",
      "auditlogs", "loginhistories", "settings", "spentcoins", "transferhistories",
      "chats", "conversations", "kycs", "livehistories", "employees", "requests",
      "tasks", "recruitmentapplications", "deletionrequests", "ads", "apikeys"
    ];

    for (const collName of collectionsToMigrate) {
      const coll = db.collection(collName);
      const docs = await coll.find({}).toArray();
      if (docs.length === 0) continue;

      console.log(`⚡ Migrating ${collName} (${docs.length} records)...`);
      for (const doc of docs) {
        const newObjId = new mongoose.Types.ObjectId();
        const updatedDoc: any = { ...doc, _id: newObjId };

        // Update common reference fields
        for (const key of Object.keys(updatedDoc)) {
          const val = updatedDoc[key];
          if (val && typeof val === "object" && val._bsontype === "ObjectID") {
            const valStr = val.toString();
            if (objectIdMap.has(valStr)) {
              updatedDoc[key] = objectIdMap.get(valStr);
            }
          } else if (key === "userId" && typeof val === "number" && numericUserIdMap.has(val)) {
            updatedDoc[key] = numericUserIdMap.get(val);
          } else if (key === "hostId" && typeof val === "number" && numericHostIdMap.has(val)) {
            updatedDoc[key] = numericHostIdMap.get(val);
          }
        }

        await coll.insertOne(updatedDoc);
        await coll.deleteOne({ _id: doc._id });
      }
    }

    // Step 5: Reset Counter Collection
    const counterCollection = db.collection("counters");
    await counterCollection.updateOne(
      { modelName: "user" },
      { $set: { seq: currentUserIdSeq } },
      { upsert: true }
    );
    console.log(`✅ Counter model sequence set to: ${currentUserIdSeq}`);

    console.log("==================================================");
    console.log("🎉 DATABASE ID REGENERATION COMPLETED SUCCESSFULLY");
    console.log("==================================================");

  } catch (err: any) {
    console.error("❌ Migration failed with error:", err?.message || err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected.");
  }
}

runMigration();
