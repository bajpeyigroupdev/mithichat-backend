import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function run() {
  const conn = await mongoose.connect(process.env.MONGO_URI || "");
  const res = await conn.connection.db?.collection("banners").updateMany({}, {
    $set: { endDate: null, isActive: true }
  });
  console.log("Updated banners active status:", res);
  await mongoose.disconnect();
}

run();
