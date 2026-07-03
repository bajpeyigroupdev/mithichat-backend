import mongoose from "mongoose";
import dotenv from "dotenv";
import Notification from "../models/notification.model";
import { User } from "../models/user.model";

dotenv.config();

const seedNotifications = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/umang");
        console.log("Connected to MongoDB for seeding notifications.");

        // Find a few users to send dummy notifications to
        const users = await User.find().limit(5);

        if (users.length === 0) {
            console.log("No users found to seed notifications. Please create a user first.");
            process.exit(1);
        }

        console.log(`Found ${users.length} users. Creating dummy notifications...`);

        const notifications = [];
        const notificationTypes: ('system' | 'promo' | 'transaction' | 'call')[] = ['system', 'promo', 'transaction', 'call'];

        for (const user of users) {
            for (let i = 0; i < 5; i++) {
                const type = notificationTypes[Math.floor(Math.random() * notificationTypes.length)];
                notifications.push({
                    userId: user._id,
                    title: `Dummy ${type.charAt(0).toUpperCase() + type.slice(1)} Alert`,
                    message: `This is a test notification of type '${type}' for user ${user.name || 'Unknown'}. Number: ${i + 1}`,
                    type: type,
                    isRead: false,
                });
            }
        }

        await Notification.insertMany(notifications);
        console.log(`Successfully seeded ${notifications.length} dummy notifications.`);
        process.exit(0);

    } catch (error) {
        console.error("Error seeding notifications:", error);
        process.exit(1);
    }
};

seedNotifications();
