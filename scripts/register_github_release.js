const axios = require('axios');

const API_BASE = 'https://api.mithichat.live/api';

async function main() {
  try {
    console.log('1. Logging in as Admin to api.mithichat.live...');
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

    const directUrl = 'https://famous-sites-teach.loca.lt';
    console.log('2. Registering TODAY Latest Release v1.8.4 (69.77MB) on Production Server with URL:', directUrl);

    const releaseRes = await axios.post(
      `${API_BASE}/v1/app-releases/upload`,
      {
        directUrl,
        versionName: '1.8.4',
        versionCode: '23',
        releaseNotes: 'Production Release v1.8.4 (Aug 20 Latest Build) with call, banner & UI fixes.',
        setAsActive: 'true'
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('API Response:', releaseRes.data);
    console.log('🎉 SUCCESS! TODAY Latest Build v1.8.4 (69.77MB) is NOW ACTIVATED & LIVE on api.mithichat.live!');
  } catch (err) {
    console.error('❌ Error registering release:', err.response?.data || err.message || err);
  }
}

main();
