import mongoose from "mongoose";
import { initializeSuperAdmin } from "../controllers/adminController";
import HostLevel from "../models/hostLevel.model";

export const seedDefaultHostLevels = async () => {
    try {
        const count = await HostLevel.countDocuments();
        if (count === 0) {
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
            await HostLevel.insertMany(levels);
            console.log("🌱 Auto-seeded default HostLevel rules 1..8");
        }
    } catch (e: any) {
        console.error("Error seeding HostLevels:", e.message);
    }
};

export const connectDB = async (MONGO_URI: string) => {
  while (true) {
    try {
      // Configure connection with pool settings for better performance
      await mongoose.connect(MONGO_URI, {
        maxPoolSize: 50, // Maximum number of connections in the pool
        minPoolSize: 10, // Minimum number of connections
        serverSelectionTimeoutMS: 5000, // Timeout for server selection
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        family: 4 // Use IPv4, skip trying IPv6
      });
      console.log("MongoDB Connected Successfully");
      initializeSuperAdmin();
      seedDefaultHostLevels();
      
      // Log connection events for monitoring
      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected; driver will reconnect automatically');
      });

      return;
    } catch (error: any) {
      // A temporary DNS/Atlas outage must not permanently kill the API.
      console.error("MongoDB Connection Error; retrying in 5 seconds:", error.message);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};
