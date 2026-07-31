import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { User } from '../models/user.model';
import Host from '../models/host.model';
import TempHostModel from '../models/temp.host.model';
import Message from '../models/chat.model';
import Conversation from '../models/conversation.model';
import { ChatViolation } from '../models/chatViolation.model';
import { BlockedUser } from '../models/blockedUser.model';
import { Counter } from '../models/counter.model';
import { Agency } from '../models/agency.model';
import { generateSecureHash } from '../utils/passwordHelper';
import { generateUniqueId } from '../utils/generator';

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/umang";
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "meethi.livechat@gmail.com";
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "admin@Owner";

async function clearAllData() {
    try {
        console.log("==================================================");
        console.log("🧹 STARTING COMPLETE DATABASE PURGE");
        console.log("==================================================");

        await mongoose.connect(MONGO_URI, { family: 4 });
        console.log("✅ Connected to MongoDB");

        // 1. Clear Collections
        console.log("🗑️ Deleting all Users...");
        await User.deleteMany({});

        console.log("🗑️ Deleting all Host applications & Host records...");
        await Host.deleteMany({});
        await TempHostModel.deleteMany({});

        console.log("🗑️ Deleting all Chat Messages & Conversations...");
        await Message.deleteMany({});
        await Conversation.deleteMany({});

        console.log("🗑️ Deleting all Chat Violation Reports...");
        await ChatViolation.deleteMany({});

        console.log("🗑️ Deleting all Blocked Users logs...");
        await BlockedUser.deleteMany({});

        console.log("🗑️ Deleting all Agencies...");
        await Agency.deleteMany({});

        // 2. Reset 10-Digit ID Counter
        console.log("🔄 Resetting 10-Digit User ID Counter...");
        await Counter.deleteMany({});
        await Counter.create({
            modelName: "user",
            seq: 1000000000,
        });

        // 3. Re-seed Fresh Clean Super Admin Account
        console.log("👑 Re-seeding Fresh Clean Super Admin...");
        const hashedPassword = await generateSecureHash(SUPER_ADMIN_PASSWORD);
        const superAdminUserId = await generateUniqueId();

        await User.create({
            name: "Super Admin",
            userId: superAdminUserId,
            email: SUPER_ADMIN_EMAIL.toLowerCase(),
            phoneNumber: "+919876543210",
            password: hashedPassword,
            role: "superAdmin",
            authType: "phone",
            gender: "male",
            emailVerified: true,
            phoneVerified: true,
            isActive: true,
            isOnline: false,
            isBlocked: false,
            device: {
                createdDeviceId: "SYSTEM_INIT_DEVICE",
                currentDeviceId: "SYSTEM_INIT_DEVICE",
                loggedInDeviceIds: ["SYSTEM_INIT_DEVICE"],
            },
            coins: 100000,
            diamonds: 100000,
        });

        console.log("==================================================");
        console.log("✨ DATABASE PURGE & RESET COMPLETED SUCCESSFULLY!");
        console.log(`   Super Admin Email: ${SUPER_ADMIN_EMAIL}`);
        console.log(`   Super Admin User ID: ${superAdminUserId}`);
        console.log("==================================================");

    } catch (error: any) {
        console.error("❌ Database purge failed:", error?.message || error);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 MongoDB Disconnected.");
    }
}

clearAllData();
