
import mongoose from "mongoose";
import { config } from "../configs/envConfig";
import { Gift } from "../models/gift.model";

const seed = async () => {
    try {
        await mongoose.connect(config.MONGO_URI as string);
        console.log("DB Connected");

        const gifts = [
            // Popular
            { name: "Rose", cost: 10, category: "Popular", icon: "https://cdn-icons-png.flaticon.com/512/744/744546.png" },
            { name: "Kiss", cost: 20, category: "Popular", icon: "https://cdn-icons-png.flaticon.com/512/3260/3260810.png" },
            { name: "Heart", cost: 50, category: "Popular", icon: "https://cdn-icons-png.flaticon.com/512/833/833472.png" },
            { name: "Chocolate", cost: 100, category: "Popular", icon: "https://cdn-icons-png.flaticon.com/512/2533/2533604.png" },

            // Romantic
            { name: "Love Letter", cost: 150, category: "Romantic", icon: "https://cdn-icons-png.flaticon.com/512/3159/3159094.png" },
            { name: "Teddy Bear", cost: 200, category: "Romantic", icon: "https://cdn-icons-png.flaticon.com/512/3308/3308528.png" },
            { name: "Bouquet", cost: 250, category: "Romantic", icon: "https://cdn-icons-png.flaticon.com/512/3342/3342137.png" },
            { name: "Ring", cost: 300, category: "Romantic", icon: "https://cdn-icons-png.flaticon.com/512/4231/4231184.png" },

            // VIP
            { name: "Diamond", cost: 500, category: "VIP", icon: "https://cdn-icons-png.flaticon.com/512/616/616430.png" },
            { name: "Shield", cost: 600, category: "VIP", icon: "https://cdn-icons-png.flaticon.com/512/1065/1065545.png" },
            { name: "Crown", cost: 800, category: "VIP", icon: "https://cdn-icons-png.flaticon.com/512/616/616550.png" },
            { name: "Castle", cost: 1500, category: "VIP", icon: "https://cdn-icons-png.flaticon.com/512/1236/1236688.png" },

            // Luxury
            { name: "Car", cost: 1000, category: "Luxury", icon: "https://cdn-icons-png.flaticon.com/512/741/741407.png" },
            { name: "Yacht", cost: 2500, category: "Luxury", icon: "https://cdn-icons-png.flaticon.com/512/2906/2906232.png" },
            { name: "Private Jet", cost: 5000, category: "Luxury", icon: "https://cdn-icons-png.flaticon.com/512/3125/3125713.png" },
            { name: "Rocket", cost: 9999, category: "Luxury", icon: "https://cdn-icons-png.flaticon.com/512/1067/1067357.png" }
        ];

        await Gift.deleteMany({});
        await Gift.insertMany(gifts);

        console.log("✅ 16 Gifts Seeded!");
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

seed();
