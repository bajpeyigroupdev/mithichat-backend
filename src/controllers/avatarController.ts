import { Gender } from './../constants/user';
import { Request, Response } from "express";
import * as avatarService from "../services/avtar.service";
import { generateUniqueId } from "../utils/generator";
import sendResponse from '../utils/reponse';

import { deleteImageFromCloudinary } from "../utils/cloudinary";

export const createAvatar = async (req: Request, res: Response) => {
    let uploadedUrl = "";
    try {
        const { gender, image, avatarUrl } = req.body;
        const finalUrl = image || avatarUrl;

        if (!gender || !finalUrl) {
            return res.status(400).json({ error: "all fields are required" });
        }

        uploadedUrl = finalUrl;

        const avatar = await avatarService.createAvatar({ avatarUrl: finalUrl, gender });
        res.status(201).json(avatar);
    } catch (err: any) {
        if (uploadedUrl && uploadedUrl.includes("cloudinary")) {
            await deleteImageFromCloudinary(uploadedUrl);
        }
        res.status(400).json({ error: err.message });
    }
};

export const getAvatars = async (req: Request, res: Response) => {
    try {
        const gender = req.params.gender;
        if (!gender) {
            return res.status(400).json({ error: "gender param is required" })
        }
        const avatars = await avatarService.getAvatars(gender);
        res.json(avatars);
    } catch (err: any) {
        res.status(500).json({ error: "please try after some time" })
    }
};

export const deleteAvatar = async (req: Request, res: Response) => {
    try {
        const deleted = await avatarService.deleteAvatar(req.params.id);
        res.json(deleted);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

