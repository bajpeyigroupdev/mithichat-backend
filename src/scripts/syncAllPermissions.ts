import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { ROLE_PERMISSION_MATRIX } from "../configs/rbacMatrix";

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function run() {
  const conn = await mongoose.connect(process.env.MONGO_URI || "");
  const collection = conn.connection.db?.collection("permissions");

  if (!collection) {
    console.error("Permissions collection not found");
    process.exit(1);
  }

  // 1. Update/Upsert role permissions in DB for all matrix roles
  for (const roleKey of Object.keys(ROLE_PERMISSION_MATRIX)) {
    const roleDef = ROLE_PERMISSION_MATRIX[roleKey];
    const res = await collection.updateOne(
      { targetType: "role", targetId: roleKey },
      {
        $set: {
          targetType: "role",
          targetId: roleKey,
          menus: roleDef.allowedModules,
          pages: roleDef.allowedRoutes,
          modules: roleDef.allowedModules,
          actions: roleDef.allowedActions,
          buttons: roleDef.allowedActions,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    console.log(`Synced role [${roleKey}]:`, res.modifiedCount || res.upsertedCount);
  }

  // 2. Also delete user-level stale override permission docs so they inherit updated role permissions
  const deleteRes = await collection.deleteMany({ targetType: "user" });
  console.log("Deleted stale user-level permission overrides:", deleteRes.deletedCount);

  await mongoose.disconnect();
  console.log("✅ All permissions successfully synced in MongoDB!");
}

run().catch(console.error);
