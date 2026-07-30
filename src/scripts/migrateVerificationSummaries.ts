import mongoose from "mongoose";
import { config } from "../configs/envConfig";
import { Kyc } from "../models/kyc.model";
import { User } from "../models/user.model";

const statusMap: Record<string, string> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
};

async function run() {
  if (!config.MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(config.MONGO_URI);
  const cursor = Kyc.find({}).select("userId status").lean().cursor();
  let updated = 0;
  for await (const legacy of cursor) {
    const result = await User.updateOne(
      { userId: legacy.userId },
      {
        $set: {
          kycVerificationStatus: statusMap[String(legacy.status)] || "NOT_SUBMITTED",
          ...(String(legacy.status) === "approved" ? { kycVerifiedAt: new Date() } : {}),
        },
      },
    );
    updated += result.modifiedCount;
  }
  console.log(`Verification summary migration complete. Updated users: ${updated}`);
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error("Verification summary migration failed:", error.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
