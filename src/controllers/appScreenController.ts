import { Request, Response } from "express";
import { AppScreen } from "../models/appScreen.model";
import sendResponse from "../utils/reponse";

// Default pre-populated screens directory for MeethiChat mobile app
const DEFAULT_SCREENS = [
  {
    screenCode: "Wallet",
    screenName: "Wallet & Diamond Purchase",
    screenCategory: "Finance",
    filePath: "src/screens/user/Wallet.js",
    description: "Handles user diamond balance, Google Play Billing, payment gateways, and package selection.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/Wallet.js
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function WalletScreen() {
  useEffect(() => {
    applyScreenSecurity('Wallet');
  }, []);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold' }}>My Wallet & Diamonds</Text>
      {/* Wallet Balance & Payment Packages */}
    </View>
  );
}`,
  },
  {
    screenCode: "VideoCall",
    screenName: "1-on-1 Video Call",
    screenCategory: "Calls",
    filePath: "src/screens/call/VideoCall.js",
    description: "Live 1-on-1 Agora video communication screen with host and user interactions.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/call/VideoCall.js
import React, { useEffect } from 'react';
import { RtcSurfaceView } from 'react-native-agora';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function VideoCallScreen({ route }) {
  useEffect(() => {
    applyScreenSecurity('VideoCall');
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Agora RTC Video View */}
    </View>
  );
}`,
  },
  {
    screenCode: "KycVerification",
    screenName: "KYC & Document Verification",
    screenCategory: "Verification",
    filePath: "src/screens/user/KycVerification.js",
    description: "Host government ID submission, Aadhaar/PAN document verification screen.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/KycVerification.js
import React, { useEffect } from 'react';
import { View, Text, TextInput } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function KycVerificationScreen() {
  useEffect(() => {
    applyScreenSecurity('KycVerification');
  }, []);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text>Government ID Upload & Verification</Text>
    </View>
  );
}`,
  },
  {
    screenCode: "Withdrawal",
    screenName: "Host Earnings & Withdrawal Portal",
    screenCategory: "Finance",
    filePath: "src/screens/user/Withdrawal.js",
    description: "Host revenue withdrawal portal for transferring call earnings to bank/UPI accounts.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/user/Withdrawal.js
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function WithdrawalScreen() {
  useEffect(() => {
    applyScreenSecurity('Withdrawal');
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Text>Bank Account & Withdrawal Management</Text>
    </View>
  );
}`,
  },
  {
    screenCode: "ChatDetail",
    screenName: "Private 1-on-1 Chat Detail",
    screenCategory: "Chats",
    filePath: "src/screens/chats/ChatDetail.js",
    description: "Private messaging, media sharing, and gift exchange between users and hosts.",
    allowScreenshot: false,
    allowScreenRecording: false,
    flagSecureEnabled: true,
    codeSnippet: `// src/screens/chats/ChatDetail.js
import React, { useEffect } from 'react';
import { View, FlatList, TextInput } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function ChatDetailScreen() {
  useEffect(() => {
    applyScreenSecurity('ChatDetail');
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* Private Chat Messages */}
    </View>
  );
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
import { View, Text } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function FaceVerificationScreen() {
  useEffect(() => {
    applyScreenSecurity('FaceVerification');
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Text>Face Liveness Check</Text>
    </View>
  );
}`,
  },
  {
    screenCode: "HostProfile",
    screenName: "Host Profile & Bio View",
    screenCategory: "User Profile",
    filePath: "src/screens/user/HostProfile.js",
    description: "Host public profile view with price per minute, bio, photos, and call initiation buttons.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/HostProfile.js
import React, { useEffect } from 'react';
import { View, Text, Image } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function HostProfileScreen() {
  useEffect(() => {
    applyScreenSecurity('HostProfile');
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* Host Profile Details & Call Action Button */}
    </View>
  );
}`,
  },
  {
    screenCode: "Home",
    screenName: "Main App Home & Discovery",
    screenCategory: "General",
    filePath: "src/screens/user/Home.js",
    description: "Main tab navigation home screen displaying online hosts, banners, and categories.",
    allowScreenshot: true,
    allowScreenRecording: true,
    flagSecureEnabled: false,
    codeSnippet: `// src/screens/user/Home.js
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { applyScreenSecurity } from '../../services/SecurityService';

export default function HomeScreen() {
  useEffect(() => {
    applyScreenSecurity('Home');
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* Discovery Feed & Online Hosts */}
    </View>
  );
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

    // Seed defaults if collection is empty
    if (screens.length === 0) {
      await AppScreen.insertMany(DEFAULT_SCREENS);
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
    // Auto sync FLAG_SECURE if screenshot is disabled
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
