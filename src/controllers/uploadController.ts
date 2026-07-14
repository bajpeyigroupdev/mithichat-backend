import { Response } from "express";
import { AuthRequest } from "../middlewares/authorize.middleware";
import cloudinary from "../utils/cloudinary";
import { config } from "../configs/envConfig";
import sendResponse from "../utils/reponse";
import { v4 as uuidv4 } from 'uuid';

export const getUploadSignature = async (req: AuthRequest, res: Response) => {
    try {
        const type = (req.query.type || req.query.folder) as string;
        const { userId } = req.user || {};

        if (!userId) {
            return sendResponse(res, 401, false, "Unauthorized");
        }

        const timestamp = Math.round(new Date().getTime() / 1000);

        // Map type to strict folder names
        let folderName = 'general';
        const normalizedType = type?.toLowerCase().trim();

        switch (normalizedType) {
            case 'kyc':
                folderName = 'kyc_documents';
                break;
            case 'avatar':
            case 'avatars':
                folderName = 'avatars';
                break;
            case 'frame':
            case 'frames':
                folderName = 'frames';
                break;
            case 'help':
                folderName = 'help_support';
                break;
            case 'chat':
                folderName = 'chat_media';
                break;
            case 'host':
            case 'hosts':
                folderName = 'hosts';
                break;
            case 'banner':
            case 'banners':
                folderName = 'banners';
                break;
            default:
                return sendResponse(res, 400, false, `Invalid upload type: ${type}. Allowed: kyc, avatar, frame, help, chat, host, banner`);
        }

        // Generate a unique public_id on the backend
        // Format: <folder>/<userId>_<timestamp>_<short_uuid>
        // Note: In Cloudinary, if you specify 'folder', the public_id should effectively be the filename inside that folder.
        // However, we can also just provide a full public_id that includes the folder if we want specific hierarchy control, 
        // but using the 'folder' parameter + a unique filename is standard.
        // Let's generate a unique filename.

        const uniqueSuffix = uuidv4().split('-')[0];
        const public_id = `${userId}_${normalizedType}_${timestamp}_${uniqueSuffix}`;

        const paramsToSign = {
            timestamp,
            folder: folderName,
            public_id: public_id,
        };

        const signature = cloudinary.utils.api_sign_request(
            paramsToSign,
            config.CLOUDINARY_API_SECRET!
        );

        return sendResponse(res, 200, true, "Signature generated successfully", {
            signature,
            timestamp,
            cloud_name: config.CLOUDINARY_CLOUD_NAME,
            api_key: config.CLOUDINARY_API_KEY,
            folder: folderName,
            public_id: public_id
        });
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message || "Failed to generate signature");
    }
};
