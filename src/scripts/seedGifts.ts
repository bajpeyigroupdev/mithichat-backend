
import mongoose from "mongoose";
import { config } from "../configs/envConfig";
import { Gift } from "../models/gift.model";

const seed = async () => {
    try {
        await mongoose.connect(config.MONGO_URI as string);
        console.log("DB Connected");

        const gifts = [
            { name: "Rose", cost: 10, icon: "https://cdn-icons-png.flaticon.com/512/744/744546.png" },
            { name: "Heart", cost: 50, icon: "https://cdn-icons-png.flaticon.com/512/833/833472.png" },
            { name: "Chocolate", cost: 100, icon: "https://cdn-icons-png.flaticon.com/512/2533/2533604.png" },
            { name: "Diamond", cost: 500, icon: "https://cdn-icons-png.flaticon.com/512/616/616430.png" },
            { name: "Car", cost: 1000, icon: "https://cdn-icons-png.flaticon.com/512/741/741407.png" }
        ];

        await Gift.deleteMany({});
        await Gift.insertMany(gifts);

        console.log("✅ 5 Gifts Seeded!");
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

seed();
