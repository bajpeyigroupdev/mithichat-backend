import { Request, Response } from "express";
import { AppScreen } from "../models/appScreen.model";
import sendResponse from "../utils/reponse";

// Complete pre-populated screen directory matching ALL mobile app screens (meethichaatapp)
const DEFAULT_SCREENS = [
  // --- CALLS ---
  {
    screenCode: "OngoingWithGifts",
    screenName: "1-on-1 Video Call & Live Gifts",
    screenCategory: "Calls",
    filePath: "src/screens/call/ongoingWithGifts.js",
    description: "Live Agora 1-on-1 video call room with real-time gift animations and coin deduction.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/call/ongoingWithGifts.js
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function OngoingCallWithGiftsScreen() {
  useEffect(() => {
    applyScreenSecurity('OngoingWithGifts');
  }, []);

  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
}`,
  },
  {
    screenCode: "CallIncoming",
    screenName: "Incoming Call Screen",
    screenCategory: "Calls",
    filePath: "src/screens/call/callIncomingScreen.js",
    description: "Full-screen incoming call notification ring screen for hosts and users.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/call/callIncomingScreen.js
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function CallIncomingScreen() {
  useEffect(() => {
    applyScreenSecurity('CallIncoming');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "CallOutgoing",
    screenName: "Outgoing Call Screen",
    screenCategory: "Calls",
    filePath: "src/screens/call/callOutgoing.js",
    description: "Dialing and connecting outgoing call screen.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/call/callOutgoing.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function CallOutgoingScreen() {
  useEffect(() => {
    applyScreenSecurity('CallOutgoing');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "CallHistory",
    screenName: "Call Logs & History",
    screenCategory: "Calls",
    filePath: "src/screens/call/callHistoryScreen.js",
    description: "Recent audio and video call log history.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/call/callHistoryScreen.js
import React, { useEffect } from 'react';
import { View, FlatList } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function CallHistoryScreen() {
  useEffect(() => {
    applyScreenSecurity('CallHistory');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },

  // --- FINANCE & RECHARGES ---
  {
    screenCode: "Wallet",
    screenName: "Wallet & Diamond Recharge",
    screenCategory: "Finance",
    filePath: "src/screens/user/Wallet.js",
    description: "Handles user diamond balance, Google Play Billing, payment gateways, and package selection.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/Wallet.js
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function WalletScreen() {
  useEffect(() => {
    applyScreenSecurity('Wallet');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "Withdrawal",
    screenName: "Host Earnings Withdrawal Portal",
    screenCategory: "Finance",
    filePath: "src/screens/user/Withdrawal.js",
    description: "Host revenue withdrawal portal for transferring call earnings to bank/UPI accounts.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/Withdrawal.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function WithdrawalScreen() {
  useEffect(() => {
    applyScreenSecurity('Withdrawal');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "RechargeHistory",
    screenName: "Recharge Transactions History",
    screenCategory: "Finance",
    filePath: "src/screens/user/RechargeHistreoy.js",
    description: "Detailed history log of diamond recharges and Google Play orders.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/RechargeHistreoy.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function RechargeHistoryScreen() {
  useEffect(() => {
    applyScreenSecurity('RechargeHistory');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "Earning",
    screenName: "Host Income & Earnings Dashboard",
    screenCategory: "Finance",
    filePath: "src/screens/user/Earning.js",
    description: "Host daily/weekly call revenue, gift income breakdown, and settlement reports.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/Earning.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function EarningScreen() {
  useEffect(() => {
    applyScreenSecurity('Earning');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "ExchangeCoins",
    screenName: "Exchange Coins for Diamonds",
    screenCategory: "Finance",
    filePath: "src/screens/user/ExchangeCoins.js",
    description: "Coin to diamond currency converter and exchange portal.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/ExchangeCoins.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function ExchangeCoinsScreen() {
  useEffect(() => {
    applyScreenSecurity('ExchangeCoins');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "ExchangeHistory",
    screenName: "Coin Exchange History Log",
    screenCategory: "Finance",
    filePath: "src/screens/user/ExchangeHistory.js",
    description: "Log of past coin-to-diamond currency conversions.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/ExchangeHistory.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function ExchangeHistoryScreen() {
  useEffect(() => {
    applyScreenSecurity('ExchangeHistory');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "CoinHistory",
    screenName: "Coin Spending & Received Log",
    screenCategory: "Finance",
    filePath: "src/screens/user/CoinHistory.js",
    description: "Detailed ledger of coins spent during calls or received via gifts.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/CoinHistory.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function CoinHistoryScreen() {
  useEffect(() => {
    applyScreenSecurity('CoinHistory');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "CoinInput",
    screenName: "Custom Coin Amount Input",
    screenCategory: "Finance",
    filePath: "src/screens/user/CoinInputSection.js",
    description: "Custom coin entry section component.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/CoinInputSection.js
import React from 'react';
import { View } from 'react-native';

export default function CoinInputSection() {
  return <View />;
}`,
  },
  {
    screenCode: "UPIVerify",
    screenName: "UPI Payment Verification",
    screenCategory: "Finance",
    filePath: "src/screens/user/UPIVerify.js",
    description: "Host UPI ID verification for direct bank settlements.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/UPIVerify.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function UPIVerifyScreen() {
  useEffect(() => {
    applyScreenSecurity('UPIVerify');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },

  // --- VERIFICATION & IDENTITY ---
  {
    screenCode: "KycVerification",
    screenName: "KYC & Identity Document Upload",
    screenCategory: "Verification",
    filePath: "src/screens/user/KycVerification.js",
    description: "Host government ID submission, Aadhaar/PAN document verification screen.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/KycVerification.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function KycVerificationScreen() {
  useEffect(() => {
    applyScreenSecurity('KycVerification');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "Kyc",
    screenName: "KYC Status & Document Check",
    screenCategory: "Verification",
    filePath: "src/screens/user/Kyc.js",
    description: "Check current approval status of submitted KYC documents.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/Kyc.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function KycScreen() {
  useEffect(() => {
    applyScreenSecurity('Kyc');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "FaceVerification",
    screenName: "Face Verification & Liveness Check",
    screenCategory: "Verification",
    filePath: "src/screens/user/FaceVerification.js",
    description: "Host selfie and face liveness detection verification screen.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/FaceVerification.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function FaceVerificationScreen() {
  useEffect(() => {
    applyScreenSecurity('FaceVerification');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "VerificationHub",
    screenName: "Verification Center Hub",
    screenCategory: "Verification",
    filePath: "src/screens/user/VerificationHub.js",
    description: "Centralized hub for face and document verification options.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/VerificationHub.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function VerificationHubScreen() {
  useEffect(() => {
    applyScreenSecurity('VerificationHub');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },

  // --- USER PROFILE & ACCOUNT ---
  {
    screenCode: "Profile",
    screenName: "User Main Profile",
    screenCategory: "User Profile",
    filePath: "src/screens/user/Profile.js",
    description: "Main user profile screen displaying avatar, level, wallet balance, and menu options.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/Profile.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function ProfileScreen() {
  useEffect(() => {
    applyScreenSecurity('Profile');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "EditProfile",
    screenName: "Edit Profile & Photos",
    screenCategory: "User Profile",
    filePath: "src/screens/user/EditProfile.js",
    description: "Edit nickname, bio, avatar photo upload, and interest tags.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/EditProfile.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function EditProfileScreen() {
  useEffect(() => {
    applyScreenSecurity('EditProfile');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "HostProfile",
    screenName: "Host Public Bio & Profile View",
    screenCategory: "User Profile",
    filePath: "src/screens/user/HostProfile.js",
    description: "Host public profile view with price per minute, bio, photos, and call initiation buttons.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/HostProfile.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function HostProfileScreen() {
  useEffect(() => {
    applyScreenSecurity('HostProfile');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "Account",
    screenName: "Account Management & ID Details",
    screenCategory: "User Profile",
    filePath: "src/screens/user/Account.js",
    description: "Account settings, bound phone numbers, and security options.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/Account.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function AccountScreen() {
  useEffect(() => {
    applyScreenSecurity('Account');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "IdManage",
    screenName: "Manage User ID & Credentials",
    screenCategory: "User Profile",
    filePath: "src/screens/user/IdManage.js",
    description: "Manage MeethiChat custom numeric ID and account security credentials.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/IdManage.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function IdManageScreen() {
  useEffect(() => {
    applyScreenSecurity('IdManage');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "LinkAccount",
    screenName: "Link Social & Phone Accounts",
    screenCategory: "User Profile",
    filePath: "src/screens/user/LinkAccount.js",
    description: "Bind Google, phone number, or email to account.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/LinkAccount.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function LinkAccountScreen() {
  useEffect(() => {
    applyScreenSecurity('LinkAccount');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "Blacklist",
    screenName: "Blocked Users & Blacklist",
    screenCategory: "User Profile",
    filePath: "src/screens/user/Blacklist.js",
    description: "Manage list of blocked users and hosts.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/Blacklist.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function BlacklistScreen() {
  useEffect(() => {
    applyScreenSecurity('Blacklist');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "Frame",
    screenName: "Avatar Frames & Badges",
    screenCategory: "User Profile",
    filePath: "src/screens/user/Frame.js",
    description: "Preview and equip exclusive avatar frames and VIP badges.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/Frame.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function FrameScreen() {
  useEffect(() => {
    applyScreenSecurity('Frame');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "Level",
    screenName: "User VIP & Host Level Status",
    screenCategory: "User Profile",
    filePath: "src/screens/user/Level.js",
    description: "Displays user experience points, level perks, and progression bar.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/Level.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function LevelScreen() {
  useEffect(() => {
    applyScreenSecurity('Level');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "LevelHelp",
    screenName: "Level Progression Guidelines",
    screenCategory: "User Profile",
    filePath: "src/screens/user/LevelHelp.js",
    description: "Explanation of level rules, privileges, and point calculations.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/LevelHelp.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function LevelHelpScreen() {
  useEffect(() => {
    applyScreenSecurity('LevelHelp');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "Ranking",
    screenName: "Daily & Weekly Host Leaderboard",
    screenCategory: "User Profile",
    filePath: "src/screens/user/Ranking.js",
    description: "Leaderboards for top hosts, daily revenue earners, and gifters.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/Ranking.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function RankingScreen() {
  useEffect(() => {
    applyScreenSecurity('Ranking');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },

  // --- CHATS & MESSAGING ---
  {
    screenCode: "ChatDetail",
    screenName: "Private 1-on-1 Chat Detail",
    screenCategory: "Chats",
    filePath: "src/screens/chats/ChatScreen.js",
    description: "Private messaging, media sharing, and gift exchange between users and hosts.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/chats/ChatScreen.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function ChatScreen() {
  useEffect(() => {
    applyScreenSecurity('ChatDetail');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "ChatList",
    screenName: "Conversations & Chat List",
    screenCategory: "Chats",
    filePath: "src/screens/chats/chatList.js",
    description: "Inbox listing all active conversations, unread messages, and official chats.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/chats/chatList.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function ChatListScreen() {
  useEffect(() => {
    applyScreenSecurity('ChatList');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "Notifications",
    screenName: "Push Notifications Center",
    screenCategory: "Chats",
    filePath: "src/screens/user/Notifications.js",
    description: "List of system alerts, call missed notifications, and gift receipts.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/Notifications.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function NotificationsScreen() {
  useEffect(() => {
    applyScreenSecurity('Notifications');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "SystemMessage",
    screenName: "Official System Announcement Messages",
    screenCategory: "Chats",
    filePath: "src/screens/user/SystemMessage.js",
    description: "Official notices, platform rules, and system broadcast messages.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/SystemMessage.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function SystemMessageScreen() {
  useEffect(() => {
    applyScreenSecurity('SystemMessage');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },

  // --- AUTHENTICATION & ONBOARDING ---
  {
    screenCode: "UmangLogin",
    screenName: "Main App Login Screen",
    screenCategory: "Auth",
    filePath: "src/screens/auth/UmangLoginScreen.js",
    description: "Primary login screen supporting Phone, Google One Tap, and Guest auth.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/auth/UmangLoginScreen.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function UmangLoginScreen() {
  useEffect(() => {
    applyScreenSecurity('UmangLogin');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "PhoneAuth",
    screenName: "Phone Number Auth",
    screenCategory: "Auth",
    filePath: "src/screens/auth/phoneAuth.js",
    description: "Mobile number login and registration entry screen.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/auth/phoneAuth.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function PhoneAuthScreen() {
  useEffect(() => {
    applyScreenSecurity('PhoneAuth');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "PhoneVerify",
    screenName: "Phone Verification Step",
    screenCategory: "Auth",
    filePath: "src/screens/auth/PhoneVerify.js",
    description: "SMS phone number input verification step.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/auth/PhoneVerify.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function PhoneVerifyScreen() {
  useEffect(() => {
    applyScreenSecurity('PhoneVerify');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "PhoneVerifyOtp",
    screenName: "SMS OTP Code Verification",
    screenCategory: "Auth",
    filePath: "src/screens/auth/PhoneVerifyOtp.js",
    description: "6-digit OTP verification input screen.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/auth/PhoneVerifyOtp.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function PhoneVerifyOtpScreen() {
  useEffect(() => {
    applyScreenSecurity('PhoneVerifyOtp');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "ForgotPassword",
    screenName: "Password Reset & Recovery",
    screenCategory: "Auth",
    filePath: "src/screens/auth/ForgotPassword.js",
    description: "Forgot password recovery step via SMS/Email.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/auth/ForgotPassword.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function ForgotPasswordScreen() {
  useEffect(() => {
    applyScreenSecurity('ForgotPassword');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "PasswordSetup",
    screenName: "Create & Set New Password",
    screenCategory: "Auth",
    filePath: "src/screens/auth/PasswordSetup.js",
    description: "New password setup screen.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/auth/PasswordSetup.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function PasswordSetupScreen() {
  useEffect(() => {
    applyScreenSecurity('PasswordSetup');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "GenderSelection",
    screenName: "Gender Selection Onboarding",
    screenCategory: "Auth",
    filePath: "src/screens/auth/GenderSelection.js",
    description: "Select gender during initial profile setup.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/auth/GenderSelection.js
import React, { useEffect } from 'react';
import { View } from 'react-native';

export default function GenderSelectionScreen() {
  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "AgeSelection",
    screenName: "Age Selection Onboarding",
    screenCategory: "Auth",
    filePath: "src/screens/auth/AgeSelection.js",
    description: "Select age during initial profile setup.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/auth/AgeSelection.js
import React, { useEffect } from 'react';
import { View } from 'react-native';

export default function AgeSelectionScreen() {
  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "CountrySelection",
    screenName: "Country & Region Selection",
    screenCategory: "Auth",
    filePath: "src/screens/auth/CountrySelection.js",
    description: "Select country code and region.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/auth/CountrySelection.js
import React from 'react';
import { View } from 'react-native';

export default function CountrySelectionScreen() {
  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "SelectLanguage",
    screenName: "Select App Language",
    screenCategory: "Auth",
    filePath: "src/screens/auth/SelectLanguage.js",
    description: "Initial language selection onboarding.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/auth/SelectLanguage.js
import React from 'react';
import { View } from 'react-native';

export default function SelectLanguageScreen() {
  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "AuthBubbleWelcome",
    screenName: "Welcome Intro & Auth Tour",
    screenCategory: "Auth",
    filePath: "src/screens/auth/AuthBubbleWelcome.js",
    description: "App onboarding welcome tour screen.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/auth/AuthBubbleWelcome.js
import React from 'react';
import { View } from 'react-native';

export default function AuthBubbleWelcomeScreen() {
  return <View style={{ flex: 1 }} />;
}`,
  },

  // --- GENERAL & SUPPORT ---
  {
    screenCode: "Home",
    screenName: "Main App Discovery & Feed",
    screenCategory: "General",
    filePath: "src/screens/user/Home.js",
    description: "Main tab navigation home screen displaying online hosts, banners, and categories.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/Home.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function HomeScreen() {
  useEffect(() => {
    applyScreenSecurity('Home');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "HostApply",
    screenName: "Host Application Form",
    screenCategory: "General",
    filePath: "src/screens/app/HostApply.js",
    description: "Application form for users applying to become official voice hosts.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/app/HostApply.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function HostApplyScreen() {
  useEffect(() => {
    applyScreenSecurity('HostApply');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "HelpAndSupport",
    screenName: "Help Desk & Support Center",
    screenCategory: "General",
    filePath: "src/screens/app/HelpAndSupport.js",
    description: "Help desk, FAQ, and customer support ticket creation.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/app/HelpAndSupport.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function HelpAndSupportScreen() {
  useEffect(() => {
    applyScreenSecurity('HelpAndSupport');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "Setting",
    screenName: "App Preferences & Settings",
    screenCategory: "General",
    filePath: "src/screens/user/Setting.js",
    description: "Account settings, notification preferences, cache clear, and logout.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/Setting.js
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function SettingScreen() {
  useEffect(() => {
    applyScreenSecurity('Setting');
  }, []);

  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "Language",
    screenName: "Change App Language",
    screenCategory: "General",
    filePath: "src/screens/user/Language.js",
    description: "Switch app language (Hindi, English, etc.).",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/Language.js
import React from 'react';
import { View } from 'react-native';

export default function LanguageScreen() {
  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "AboutUs",
    screenName: "About MeethiChat App",
    screenCategory: "General",
    filePath: "src/screens/app/AboutUs.js",
    description: "App version details and company info.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/app/AboutUs.js
import React from 'react';
import { View } from 'react-native';

export default function AboutUsScreen() {
  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "ContactUs",
    screenName: "Contact Support & Office",
    screenCategory: "General",
    filePath: "src/screens/app/ContactUs.js",
    description: "Support email and contact details.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/app/ContactUs.js
import React from 'react';
import { View } from 'react-native';

export default function ContactUsScreen() {
  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "TermsOfUse",
    screenName: "Terms & Conditions",
    screenCategory: "General",
    filePath: "src/screens/app/TermOfUse.js",
    description: "Terms of Service document.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/app/TermOfUse.js
import React from 'react';
import { View } from 'react-native';

export default function TermsOfUseScreen() {
  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "PrivacyPolicy",
    screenName: "Privacy Policy & GDPR",
    screenCategory: "General",
    filePath: "src/screens/app/PrivacyPolicy.js",
    description: "Privacy policy document.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/app/PrivacyPolicy.js
import React from 'react';
import { View } from 'react-native';

export default function PrivacyPolicyScreen() {
  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "RefundPolicy",
    screenName: "Refund & Billing Terms",
    screenCategory: "General",
    filePath: "src/screens/app/RefundPolicy.js",
    description: "Refund terms and conditions.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/app/RefundPolicy.js
import React from 'react';
import { View } from 'react-native';

export default function RefundPolicyScreen() {
  return <View style={{ flex: 1 }} />;
}`,
  },
  {
    screenCode: "Rules",
    screenName: "Community Conduct & Call Rules",
    screenCategory: "General",
    filePath: "src/screens/app/Rules.js",
    description: "Platform guidelines and host conduct rules.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/app/Rules.js
import React from 'react';
import { View } from 'react-native';

export default function RulesScreen() {
  return <View style={{ flex: 1 }} />;
}`,
  },
];

/**
 * Get All App Screens with Code & Security Flags
 * GET /api/v1/app-screens/all
 */
export const getAllScreens = async (_req: Request, res: Response) => {
  try {
    let screens = await AppScreen.find().sort({ screenCategory: 1, screenName: 1 });

    // Upsert missing default screens so all screens exist in DB
    const existingCodes = new Set(screens.map((s) => s.screenCode));
    const missing = DEFAULT_SCREENS.filter((d) => !existingCodes.has(d.screenCode));

    if (missing.length > 0) {
      await AppScreen.insertMany(missing);
      screens = await AppScreen.find().sort({ screenCategory: 1, screenName: 1 });
    }

    return sendResponse(res, 200, true, "App screens fetched successfully.", screens);
  } catch (error: any) {
    console.error("[AppScreen] getAllScreens error:", error);
    return sendResponse(res, 500, false, "Failed to fetch app screens list.");
  }
};

/**
 * Public API for React Native App: Get Screen Security Rules
 * GET /api/v1/app-screens/public-config
 */
export const getPublicScreenSecurityConfig = async (_req: Request, res: Response) => {
  try {
    let screens = await AppScreen.find({ isActive: true });

    if (screens.length === 0) {
      await AppScreen.insertMany(DEFAULT_SCREENS);
      screens = await AppScreen.find({ isActive: true });
    }

    const configMap: Record<string, { allowScreenshot: boolean; allowScreenRecording: boolean; flagSecureEnabled: boolean }> = {};

    screens.forEach((s) => {
      configMap[s.screenCode] = {
        allowScreenshot: s.allowScreenshot,
        allowScreenRecording: s.allowScreenRecording,
        flagSecureEnabled: s.flagSecureEnabled,
      };
    });

    return res.status(200).json({
      success: true,
      screens: configMap,
    });
  } catch (error: any) {
    console.error("[AppScreen] getPublicScreenSecurityConfig error:", error);
    return sendResponse(res, 500, false, "Failed to load dynamic screen security configuration.");
  }
};

/**
 * Create a new Screen entry in directory
 * POST /api/v1/app-screens/create
 */
export const createScreen = async (req: Request, res: Response) => {
  try {
    const { screenCode, screenName, screenCategory, description, allowScreenshot, allowScreenRecording, flagSecureEnabled, codeSnippet, filePath } = req.body;

    if (!screenCode || !screenName) {
      return sendResponse(res, 400, false, "Screen code and Screen name are required.");
    }

    const existing = await AppScreen.findOne({ screenCode: String(screenCode).trim() });
    if (existing) {
      return sendResponse(res, 400, false, `Screen with code '${screenCode}' already exists.`);
    }

    const screen = await AppScreen.create({
      screenCode: String(screenCode).trim(),
      screenName: String(screenName).trim(),
      screenCategory: screenCategory ? String(screenCategory).trim() : "General",
      description: description ? String(description).trim() : "",
      filePath: filePath ? String(filePath).trim() : "",
      codeSnippet: codeSnippet ? String(codeSnippet) : "// Source Code Component",
      allowScreenshot: Boolean(allowScreenshot),
      allowScreenRecording: Boolean(allowScreenRecording),
      flagSecureEnabled: Boolean(flagSecureEnabled),
      isActive: true,
    });

    return sendResponse(res, 201, true, `Screen '${screenName}' added to directory successfully.`, screen);
  } catch (error: any) {
    console.error("[AppScreen] createScreen error:", error);
    return sendResponse(res, 500, false, "Failed to create screen entry.");
  }
};

/**
 * Update Screen Details & Code Component
 * PUT /api/v1/app-screens/:id
 */
export const updateScreen = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { screenName, screenCategory, description, allowScreenshot, allowScreenRecording, flagSecureEnabled, codeSnippet, filePath } = req.body;

    const screen = await AppScreen.findById(id);
    if (!screen) {
      return sendResponse(res, 404, false, "Screen record not found.");
    }

    if (screenName !== undefined) screen.screenName = String(screenName).trim();
    if (screenCategory !== undefined) screen.screenCategory = String(screenCategory).trim();
    if (description !== undefined) screen.description = String(description).trim();
    if (filePath !== undefined) screen.filePath = String(filePath).trim();
    if (codeSnippet !== undefined) screen.codeSnippet = String(codeSnippet);
    if (allowScreenshot !== undefined) screen.allowScreenshot = Boolean(allowScreenshot);
    if (allowScreenRecording !== undefined) screen.allowScreenRecording = Boolean(allowScreenRecording);
    if (flagSecureEnabled !== undefined) screen.flagSecureEnabled = Boolean(flagSecureEnabled);

    await screen.save();

    return sendResponse(res, 200, true, `Screen '${screen.screenName}' updated successfully.`, screen);
  } catch (error: any) {
    console.error("[AppScreen] updateScreen error:", error);
    return sendResponse(res, 500, false, "Failed to update screen record.");
  }
};

/**
 * Quick Toggle Screenshot Protection
 * PATCH /api/v1/app-screens/:id/toggle-screenshot
 */
export const toggleScreenshot = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const screen = await AppScreen.findById(id);
    if (!screen) {
      return sendResponse(res, 404, false, "Screen record not found.");
    }

    screen.allowScreenshot = !screen.allowScreenshot;
    if (!screen.allowScreenshot) {
      screen.flagSecureEnabled = true;
    }
    await screen.save();

    const statusStr = screen.allowScreenshot ? "ENABLED (Allowed)" : "DISABLED (Blocked)";
    return sendResponse(res, 200, true, `Screenshot on '${screen.screenName}' is now ${statusStr}.`, screen);
  } catch (error: any) {
    console.error("[AppScreen] toggleScreenshot error:", error);
    return sendResponse(res, 500, false, "Failed to toggle screenshot setting.");
  }
};

/**
 * Quick Toggle Screen Recording Protection
 * PATCH /api/v1/app-screens/:id/toggle-recording
 */
export const toggleRecording = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const screen = await AppScreen.findById(id);
    if (!screen) {
      return sendResponse(res, 404, false, "Screen record not found.");
    }

    screen.allowScreenRecording = !screen.allowScreenRecording;
    if (!screen.allowScreenRecording) {
      screen.flagSecureEnabled = true;
    }
    await screen.save();

    const statusStr = screen.allowScreenRecording ? "ENABLED (Allowed)" : "DISABLED (Blocked)";
    return sendResponse(res, 200, true, `Screen recording on '${screen.screenName}' is now ${statusStr}.`, screen);
  } catch (error: any) {
    console.error("[AppScreen] toggleRecording error:", error);
    return sendResponse(res, 500, false, "Failed to toggle screen recording setting.");
  }
};

/**
 * Delete a Screen entry
 * DELETE /api/v1/app-screens/:id
 */
export const deleteScreen = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await AppScreen.findByIdAndDelete(id);
    return sendResponse(res, 200, true, "Screen entry removed from directory.");
  } catch (error: any) {
    console.error("[AppScreen] deleteScreen error:", error);
    return sendResponse(res, 500, false, "Failed to delete screen entry.");
  }
};
