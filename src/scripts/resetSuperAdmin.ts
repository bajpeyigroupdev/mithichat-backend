/**
 * Script to reset/update Super Admin credentials from .env
 * Run: npx ts-node src/scripts/resetSuperAdmin.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { User } from '../models/user.model';
import { generateSecureHash } from '../utils/passwordHelper';
import { generateUniqueId } from '../utils/generator';

const MONGO_URI = process.env.MONGO_URI!;
const EMAIL = process.env.SUPER_ADMIN_EMAIL!;
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD!;
const PHONE = process.env.SUPER_ADMIN_PHONE;
const ROLE = process.env.SUPER_ADMIN_ROLE || 'superAdmin';

async function resetSuperAdmin() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI, { family: 4 });
        console.log('✅ Connected to MongoDB');

        const hashedPassword = await generateSecureHash(PASSWORD);

        // Find by email directly (may be any role) and update password
        const existing = await User.findOne({ email: EMAIL }).select('+password');

        if (existing) {
            // Update password and ensure not blocked
            existing.password = hashedPassword;
            existing.isBlocked = false;
            existing.isDeleted = false;
            existing.isActive = true;
            existing.role = ROLE as any;
            if (PHONE) existing.phoneNumber = PHONE;
            await existing.save();
            console.log(`✅ Super Admin credentials updated successfully!`);
            console.log(`   Email: ${EMAIL}`);
            console.log(`   Password: ${PASSWORD}`);
            console.log(`   Role: ${existing.role}`);
        } else {
            // Create new
            const userId = await generateUniqueId();
            await User.create({
                name: 'Super Admin',
                userId,
                email: EMAIL,
                phoneNumber: PHONE || undefined,
                password: hashedPassword,
                role: ROLE,
                authType: 'google',
                gender: 'male',
                emailVerified: true,
                phoneVerified: true,
                isActive: true,
                isOnline: false,
                isBlocked: false,
                device: {
                    createdDeviceId: 'SYSTEM_INIT',
                    currentDeviceId: 'SYSTEM_INIT',
                    loggedInDeviceIds: ['SYSTEM_INIT'],
                },
                createdBy: null,
            });
            console.log(`✅ Super Admin created successfully!`);
            console.log(`   Email: ${EMAIL}`);
            console.log(`   Password: ${PASSWORD}`);
            console.log(`   Role: ${ROLE}`);
        }

        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

resetSuperAdmin();
