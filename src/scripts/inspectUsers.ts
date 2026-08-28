import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/umang";

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB:", MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) return;

  const usersColl = db.collection("users");
  const total = await usersColl.countDocuments({});
  const active = await usersColl.countDocuments({ isDeleted: false });
  const deleted = await usersColl.countDocuments({ isDeleted: true });

  console.log(`Total users in collection: ${total}`);
  console.log(`isDeleted=false: ${active}`);
  console.log(`isDeleted=true: ${deleted}`);

  // Breakdown by role
  const byRole = await usersColl.aggregate([
    { $group: { _id: "$role", count: { $sum: 1 }, notDeleted: { $sum: { $cond: [{ $eq: ["$isDeleted", true] }, 0, 1] } } } }
  ]).toArray();
  console.log("Users breakdown by role:", JSON.stringify(byRole, null, 2));

  // Check user ID formats (e.g. min, max, < 1000000000)
  const non10Digit = await usersColl.find({ userId: { $lt: 1000000000 } }).toArray();
  console.log(`Users with userId < 1000000000: ${non10Digit.length}`);

  const sampleUsers = await usersColl.find({}).sort({ createdAt: -1 }).limit(15).project({ userId: 1, name: 1, role: 1, phoneNumber: 1, email: 1, isDeleted: 1, createdAt: 1, sourceForm: 1 }).toArray();
  console.log("Sample recent users:", JSON.stringify(sampleUsers, null, 2));

  const sampleOldUsers = await usersColl.find({}).sort({ createdAt: 1 }).limit(10).project({ userId: 1, name: 1, role: 1, phoneNumber: 1, email: 1, isDeleted: 1, createdAt: 1, sourceForm: 1 }).toArray();
  console.log("Sample oldest users:", JSON.stringify(sampleOldUsers, null, 2));

  await mongoose.disconnect();
}

run();
