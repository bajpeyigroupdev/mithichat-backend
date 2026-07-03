import { v2 as cloudinary } from 'cloudinary';
import { config } from '../configs/envConfig';

cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET
});

export const deleteImageFromCloudinary = async (imageUrl: string) => {
    try {
        if (!imageUrl || !imageUrl.includes('res.cloudinary.com')) return;

        // Extract public_id
        // URL format: https://res.cloudinary.com/<cloud_name>/image/upload/v<version>/<folder>/<id>.<ext>
        // OR: https://res.cloudinary.com/<cloud_name>/image/upload/<folder>/<id>.<ext>

        const parts = imageUrl.split('/upload/');
        if (parts.length < 2) return;

        let publicIdWithExt = parts[1];
        // Remove version if present (v123456/)
        if (publicIdWithExt.startsWith('v')) {
            const versionEnd = publicIdWithExt.indexOf('/');
            if (versionEnd !== -1) {
                publicIdWithExt = publicIdWithExt.substring(versionEnd + 1);
            }
        }

        // Remove extension
        const lastDot = publicIdWithExt.lastIndexOf('.');
        const publicId = lastDot !== -1 ? publicIdWithExt.substring(0, lastDot) : publicIdWithExt;

        console.log(`Deleting from Cloudinary. Public ID: ${publicId}`);
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error("Error deleting image from Cloudinary:", error);
    }
};

export default cloudinary;
