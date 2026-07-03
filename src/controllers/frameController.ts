import { Request, Response } from "express";
import * as levelService from "../services/frame.service";
import { AuthRequest } from "../middlewares/authorize.middleware.js";
import { deleteImageFromCloudinary } from "../utils/cloudinary";

export const createLevel = async (req: AuthRequest, res: Response) => {
    let imageUrl = "";
    try {
        const { text, level, image } = req.body;

        if (!text || !level || !image) {
            return res.status(400).json({ error: "All fields (text, level, image) are required" });
        }

        imageUrl = image;

        const levelData = await levelService.createLevel({ text, level, image });
        res.status(201).json(levelData);
    } catch (err: any) {
        if (imageUrl && imageUrl.includes("cloudinary")) {
            await deleteImageFromCloudinary(imageUrl);
        }
        res.status(400).json({ error: err.message });
    }
};

export const getLevels = async (req: AuthRequest, res: Response) => {
    try {
        const levels = await levelService.getLevels();
        res.json(levels);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteLevel = async (req: Request, res: Response) => {
    try {
        const deleted = await levelService.deleteLevel(req.params.id);
        res.json(deleted);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};


