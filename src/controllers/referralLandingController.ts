import { Request, Response } from 'express';
import { User } from '../models/user.model';

export const renderReferralLandingPage = async (req: Request, res: Response) => {
  try {
    const rawRef = String(req.query.ref || req.query.code || '').trim().toUpperCase();

    let inviterName = 'A Friend';
    let inviterAvatar = '';
    let inviterCode = rawRef || 'OFFER25';

    if (rawRef) {
      const inviter = await User.findOne({
        $or: [
          { referralCode: rawRef },
          { specialCode: rawRef },
          { employeeCode: rawRef },
          { userId: Number(rawRef) || -1 },
        ],
        isDeleted: false,
      }).select('name image referralCode userId').lean();

      if (inviter) {
        inviterName = inviter.name || `User #${inviter.userId}`;
        inviterAvatar = inviter.image || '';
        inviterCode = inviter.referralCode || rawRef;
      }
    }

    const playStoreUrl = "https://play.google.com/store/apps/details?id=com.umangchatlive";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join Meethi Chat — Claim Your 100 Free Welcome Coins!</title>
  <meta name="description" content="${inviterName} has invited you to join Meethi Chat! Download the app from Google Play and enter code ${inviterCode} to get 100 Free Coins.">
  
  <!-- OpenGraph / Social Meta Tags -->
  <meta property="og:title" content="Meethi Chat Special Invitation from ${inviterName}">
  <meta property="og:description" content="Use code ${inviterCode} to claim 100 Free Welcome Coins on India's #1 Live Video & Voice Social App.">
  <meta property="og:image" content="${inviterAvatar || 'https://mithichat.live/logo.png'}">
  <meta property="og:url" content="https://mithichat.live/invite?ref=${inviterCode}">
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    body {
      background: radial-gradient(circle at top center, #1b0c3d 0%, #070313 100%);
      color: #ffffff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      overflow-x: hidden;
    }

    .background-glow {
      position: absolute;
      width: 350px;
      height: 350px;
      background: radial-gradient(circle, rgba(236, 72, 153, 0.35) 0%, rgba(139, 92, 246, 0.15) 50%, transparent 80%);
      filter: blur(60px);
      top: 10%;
      z-index: 0;
      pointer-events: none;
    }

    .container {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 480px;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 32px;
      padding: 32px 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      text-align: center;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: linear-gradient(135deg, rgba(236, 72, 153, 0.25), rgba(139, 92, 246, 0.25));
      border: 1px solid rgba(236, 72, 153, 0.4);
      color: #f472b6;
      font-weight: 700;
      font-size: 13px;
      padding: 6px 16px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 20px;
    }

    .inviter-card {
      display: flex;
      align-items: center;
      gap: 14px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 14px 18px;
      margin-bottom: 24px;
      text-align: left;
    }

    .inviter-avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      border: 2px solid #ec4899;
      object-fit: cover;
      background: #2a1b4e;
    }

    .inviter-info h4 {
      font-size: 17px;
      font-weight: 700;
      color: #ffffff;
    }

    .inviter-info p {
      font-size: 13px;
      color: #a78bfa;
    }

    .title {
      font-size: 28px;
      font-weight: 900;
      line-height: 1.25;
      background: linear-gradient(135deg, #ffffff 0%, #f472b6 50%, #c084fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 12px;
    }

    .subtitle {
      font-size: 15px;
      color: #cbd5e1;
      line-height: 1.5;
      margin-bottom: 24px;
    }

    .bonus-box {
      background: linear-gradient(135deg, #e11d48 0%, #9333ea 100%);
      border-radius: 24px;
      padding: 20px;
      box-shadow: 0 10px 25px rgba(225, 29, 72, 0.3);
      margin-bottom: 28px;
      position: relative;
      overflow: hidden;
    }

    .bonus-box::after {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 60%);
      transform: rotate(30deg);
      pointer-events: none;
    }

    .bonus-title {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.9);
      margin-bottom: 6px;
    }

    .bonus-val {
      font-size: 32px;
      font-weight: 900;
      color: #fbbf24;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }

    .code-card {
      background: rgba(0, 0, 0, 0.3);
      border: 2px dashed rgba(236, 72, 153, 0.5);
      border-radius: 20px;
      padding: 16px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .code-val {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 2px;
      color: #38bdf8;
    }

    .copy-btn {
      background: linear-gradient(135deg, #06b6d4, #3b82f6);
      color: #ffffff;
      border: none;
      font-weight: 700;
      font-size: 14px;
      padding: 10px 18px;
      border-radius: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(6, 182, 212, 0.3);
    }

    .copy-btn:active {
      transform: scale(0.96);
    }

    .playstore-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
      background: #000000;
      border: 2px solid #334155;
      color: #ffffff;
      padding: 16px;
      border-radius: 20px;
      text-decoration: none;
      font-weight: 700;
      font-size: 18px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      transition: all 0.3s ease;
      margin-bottom: 24px;
    }

    .playstore-btn:hover {
      border-color: #38bdf8;
      box-shadow: 0 12px 30px rgba(56, 189, 248, 0.3);
      transform: translateY(-2px);
    }

    .playstore-icon {
      width: 28px;
      height: 28px;
    }

    .steps-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: 18px;
      text-align: left;
    }

    .steps-head {
      font-size: 13px;
      font-weight: 800;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 14px;
    }

    .step-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

    .step-item:last-child {
      margin-bottom: 0;
    }

    .step-num {
      width: 28px;
      height: 28px;
      background: rgba(236, 72, 153, 0.2);
      border: 1px solid #ec4899;
      color: #f472b6;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 13px;
      flex-shrink: 0;
    }

    .step-text h5 {
      font-size: 14px;
      font-weight: 700;
      color: #f8fafc;
    }

    .step-text p {
      font-size: 12px;
      color: #94a3b8;
    }

    .toast {
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #10b981;
      color: #ffffff;
      font-weight: 700;
      padding: 12px 24px;
      border-radius: 999px;
      box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      z-index: 100;
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>

  <div class="background-glow"></div>

  <div class="container">
    <div class="badge">✨ Special Invite</div>

    <div class="inviter-card">
      <img src="${inviterAvatar || 'https://mithichat.live/logo.png'}" alt="Inviter" class="inviter-avatar" onerror="this.src='https://mithichat.live/logo.png'">
      <div class="inviter-info">
        <h4>${inviterName}</h4>
        <p>invited you to join Meethi Chat!</p>
      </div>
    </div>

    <h1 class="title">Get 100 Free Welcome Coins!</h1>
    <p class="subtitle">Download the app, complete profile with referral code <strong style="color:#f472b6;">${inviterCode}</strong> & start live video talking!</p>

    <div class="bonus-box">
      <div class="bonus-title">YOUR SIGN-UP REWARD</div>
      <div class="bonus-val">+100 WELCOME COINS</div>
    </div>

    <div class="code-card">
      <div>
        <div style="font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">REFERRAL CODE</div>
        <div class="code-val" id="referralCode">${inviterCode}</div>
      </div>
      <button class="copy-btn" onclick="copyCode()">COPY CODE</button>
    </div>

    <a href="${playStoreUrl}" class="playstore-btn" target="_blank" rel="noopener">
      <svg class="playstore-icon" viewBox="0 0 512 512" fill="none">
        <path d="M325.8 243.8L61.4 382.4C44 391.6 32 376.6 32 355.6V156.4C32 135.4 44 120.4 61.4 129.6L325.8 268.2C338.4 274.8 338.4 287.2 325.8 293.8L325.8 243.8Z" fill="#00D2FF"/>
        <path d="M380.2 215.2L325.8 243.8L325.8 293.8L380.2 322.4C398.8 332.2 416 322.2 416 300.8V236.8C416 215.4 398.8 205.4 380.2 215.2Z" fill="#FFD000"/>
        <path d="M61.4 129.6L246 256L325.8 215.2L61.4 129.6Z" fill="#00F076"/>
        <path d="M61.4 382.4L325.8 296.8L246 256L61.4 382.4Z" fill="#FF3A44"/>
      </svg>
      Get it on Google Play
    </a>

    <div class="steps-card">
      <div class="steps-head">HOW IT WORKS</div>
      <div class="step-item">
        <div class="step-num">1</div>
        <div class="step-text">
          <h5>Download & Setup Profile</h5>
          <p>Install Meethi Chat & enter code <strong>${inviterCode}</strong> to get 100 Free Welcome Coins. Inviter gets 25 Coins!</p>
        </div>
      </div>
      <div class="step-item">
        <div class="step-num">2</div>
        <div class="step-text">
          <h5>Talk 5 Minutes on Call</h5>
          <p>Enjoy live voice/video calls. After 5 mins of talking, inviter earns +25 Bonus Coins!</p>
        </div>
      </div>
    </div>

    <div class="footer">
      © 2026 Meethi Chat. All rights reserved.
    </div>
  </div>

  <div class="toast" id="toast">Referral Code Copied!</div>

  <script>
    function copyCode() {
      const code = document.getElementById('referralCode').innerText;
      navigator.clipboard.writeText(code).then(() => {
        showToast("Referral Code " + code + " Copied!");
      }).catch(() => {
        const input = document.createElement('input');
        input.value = code;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast("Referral Code " + code + " Copied!");
      });
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2500);
    }
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  } catch (error: any) {
    return res.status(500).send("Server Error loading referral landing page");
  }
};
