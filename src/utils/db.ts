import mongoose from "mongoose";
import { initializeSuperAdmin } from "../controllers/adminController";


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
