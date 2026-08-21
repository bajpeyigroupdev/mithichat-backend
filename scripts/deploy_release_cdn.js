const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dinjtxdtj',
  api_key: '698671159281533',
  api_secret: 'XE_4TqPrwPL0j4vvFCnRwX8ewa0',
  secure: true
});

const API_BASE = 'https://api.mithichat.live/api';

async function main() {
  try {
    console.log('1. Logging in as Admin...');
    const loginRes = await axios.post(`${API_BASE}/admin/login`, {
      email: 'meethi.livechat@gmail.com',
      password: 'admin@Owner'
    });

    console.log('Login Status:', loginRes.data.success, loginRes.data.message);
    const token = loginRes.data.data?.token || loginRes.data.token;
    if (!token) {
      throw new Error('No token returned from admin login!');
    }
    console.log('Admin Token Acquired Successfully!');

    const apkPath = path.resolve(__dirname, '../../MithiChat-v1.5-call-banner-fix.apk');
    console.log('2. Checking build APK file at:', apkPath);
    if (!fs.existsSync(apkPath)) {
      throw new Error(`APK file not found at ${apkPath}`);
    }

    const fileSizeMB = (fs.statSync(apkPath).size / (1024 * 1024)).toFixed(2);
    console.log(`APK File found! Size: ${fileSizeMB} MB`);

    console.log('3. Uploading APK to Cloudinary storage CDN (this takes ~10-15s for 67MB)...');
    const uploadRes = await cloudinary.uploader.upload(apkPath, {
      resource_type: 'raw',
      folder: 'app_releases',
      public_id: `MeethiChat-v1.8.3-${Date.now()}.apk`
    });

    console.log('Cloudinary Upload Success!');
    console.log('Secure URL:', uploadRes.secure_url);

    console.log('4. Registering Release on Production API (api.mithichat.live)...');
    const releaseRes = await axios.post(
      `${API_BASE}/v1/app-releases/upload`,
      {
        directUrl: uploadRes.secure_url,
        versionName: '1.8.3',
        versionCode: '22',
        releaseNotes: 'Production Build v1.8.3 with call and banner enhancements.',
        setAsActive: 'true'
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Release Registration Result:', releaseRes.data);
    console.log('🎉 SUCCESS! Latest Build v1.8.3 is NOW LIVE on Website & API!');
  } catch (err) {
    console.error('❌ Error during automated release script:', err.response?.data || err.message || err);
  }
}

main();
