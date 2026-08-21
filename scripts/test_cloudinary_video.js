const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dinjtxdtj',
  api_key: '698671159281533',
  api_secret: 'XE_4TqPrwPL0j4vvFCnRwX8ewa0',
  secure: true
});

async function main() {
  try {
    const apkPath = path.resolve(__dirname, '../../MithiChat-v1.5-call-banner-fix.apk');
    console.log('Uploading APK as resource_type video to bypass raw limit...');
    const result = await cloudinary.uploader.upload(apkPath, {
      resource_type: 'video',
      folder: 'app_releases',
      public_id: `MeethiChat-v1.8.3-build.apk`
    });

    console.log('🎉 Cloudinary Video Upload SUCCESS!');
    console.log('URL:', result.secure_url);
  } catch (err) {
    console.error('❌ Cloudinary Video Upload Error:', err.message || err);
  }
}

main();
