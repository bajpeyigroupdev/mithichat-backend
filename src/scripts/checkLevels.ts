import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import HostLevel from '../models/hostLevel.model';
import { User } from '../models/user.model';
import { config } from '../configs/envConfig';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const check = async () => {
    try {
        await mongoose.connect(config.MONGO_URI as string);
        console.log('Connected to DB:', config.MONGO_URI);
        const count = await HostLevel.countDocuments({});
        console.log('HostLevel count:', count);
        const levels = await HostLevel.find({}).sort({ level: 1 }).lean();
        console.log('HostLevel documents:', JSON.stringify(levels, null, 2));

        const userCount = await User.countDocuments({ role: 'host' });
        console.log('Host users count:', userCount);
        const sampleHost = await User.findOne({ role: 'host' }).select('name level email userName').lean();
        console.log('Sample host:', sampleHost);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

check();
