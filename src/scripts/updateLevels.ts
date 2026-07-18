import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import HostLevel from '../models/hostLevel.model';
import { config } from '../configs/envConfig'; // BUG-12 FIX: import moved to top of file

dotenv.config({ path: path.join(__dirname, '../../.env') });

const levels = [
    { level: 1, name: 'Basic', minCalls: 80, minMinutes: 120, coinPerMinute: 25 },
    { level: 2, name: 'Copper', minCalls: 110, minMinutes: 200, coinPerMinute: 30 },
    { level: 3, name: 'Bronze', minCalls: 160, minMinutes: 330, coinPerMinute: 36 },
    { level: 4, name: 'Silver', minCalls: 220, minMinutes: 500, coinPerMinute: 42 },
    { level: 5, name: 'Gold', minCalls: 300, minMinutes: 700, coinPerMinute: 48 },
    { level: 6, name: 'Platinum', minCalls: 400, minMinutes: 950, coinPerMinute: 54 },
    { level: 7, name: 'Diamond', minCalls: 500, minMinutes: 1200, coinPerMinute: 60 },
    { level: 8, name: 'Grand Master', minCalls: 600, minMinutes: 1500, coinPerMinute: 66 },
];


const updateLevels = async () => {
    try {
        await mongoose.connect(config.MONGO_URI as string);
        console.log('Connected to DB');

        // Delete existing levels
        await HostLevel.deleteMany({});
        console.log('Cleared existing levels');

        // Insert new regular levels
        await HostLevel.insertMany(levels);
        console.log('Inserted standard levels');

        // Create temporary promo level
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        
        await HostLevel.create({
            level: 0,
            name: 'Preview Level (7 Days)',
            minCalls: 0,
            minMinutes: 0,
            coinPerMinute: 20,
            expiresAt: expiresAt
        });
        console.log('Inserted temporary Preview Level');

        console.log('Level update complete!');
        process.exit(0);
    } catch (error) {
        console.error('Error updating levels:', error);
        process.exit(1);
    }
};

updateLevels();
