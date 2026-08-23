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

        let folderName = 'general';
        const normalizedType = type?.toLowerCase().trim();

        switch (normalizedType) {
            case 'image':
            case 'images':
            case 'photo':
            case 'photos':
            case 'kyc':
            case 'doc':
            case 'document':
            case 'documents':
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
            case 'raw':
            case 'audio':
            case 'voice':
            case 'video':
            case 'file':
                folderName = 'voice_recordings';
                break;
            default:
                return sendResponse(res, 400, false, `Invalid upload type: ${type}. Allowed: kyc, avatar, frame, help, chat, host, banner, raw, audio, voice, doc`);
        }

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

/**
 * Direct file upload handler for gift icons, animations (.svga, .gif, .webp, .png) and admin assets.
 */
export const uploadDirectFile = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return sendResponse(res, 400, false, "No file uploaded");
    }

    const host = req.get("host") || "api.mithichat.live";
    const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const fileUrl = `${protocol}://${host}/uploads/gifts/${file.filename}`;

    return sendResponse(res, 200, true, "File uploaded successfully", {
      url: fileUrl,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
    });
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message || "Failed to upload file");
  }
};
