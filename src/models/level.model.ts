import mongoose, { Schema, model, Document } from "mongoose";

// TypeScript interface for a Level
export interface ILevel extends Document {
    level: number;
    text?: string;
    image?: string;
}

// Mongoose schema
const LevelSchema = new Schema<ILevel>(
    {
        level: { type: Number, required: true },
        text: { type: String },
        image: { type: String },
    },
    { timestamps: true }
);

// Export model - handle potential re-compilation
const Level = mongoose.models.Level || model<ILevel>("Level", LevelSchema);
export default Level;
