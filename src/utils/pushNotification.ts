import admin from "firebase-admin";
import path from "path";

// ✅ initialize once
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(
        // 🧠 Changed to serviceAccountKey.json (Server Key) instead of google-services.json (Android Key)
        // Also fixed path: __dirname (utils) -> .. (src) -> configs -> serviceAccountKey.json
        path.resolve(__dirname, "../configs/serviceAccountKey.json")
      ),
    });
  } catch (error) {
    console.warn("Firebase Init Error: Check configs/google-services.json or env vars.");
    admin.initializeApp(); // Fallback to env vars
  }
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>; // extra custom data
}

export const sendPushNotification = async (
  deviceTokens: string[], // multiple FCM tokens
  payload: PushPayload
) => {
  if (!deviceTokens || deviceTokens.length === 0) {
    return { success: false, message: "No device tokens provided" };
  }

  try {
    const message: admin.messaging.MulticastMessage = {
      tokens: deviceTokens,
      // The requirement "Adjust push notification flow to show login page before notifications"
      // Can be met by passing a specific action flag in data for the client to handle
      data: {
        ...payload.data,
        action: payload.data?.action || "login_redirect", // Default route to login before showing notification content
        title: payload.title,
        body: payload.body,
      },
      // Keep notification block so it shows in system tray
      notification: {
        title: payload.title,
        body: payload.body,
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];
      response.responses.forEach((res, index) => {
        if (!res.success && res.error) {
          const code = res.error.code;
          const msg = res.error.message || "";
          if (code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-registration-token' ||
              msg.includes('registration-token-not-registered') ||
              msg.includes('invalid-registration-token')) {
            tokensToRemove.push(deviceTokens[index]);
          }
        }
      });
      if (tokensToRemove.length > 0) {
        console.log(`🧹 Removing invalid multicast FCM tokens from DB:`, tokensToRemove);
        const { User } = require("../models/user.model");
        await User.updateMany({ fcmToken: { $in: tokensToRemove } }, { $set: { fcmToken: "" } });
      }
    }

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
    };
  } catch (error: any) {
    return { success: false, message: error.message || "Push send failed" };
  }
};

// Send Silent Login Redirect Notification
export const sendLoginRedirectNotification = async (
  deviceTokens: string[],
  title: string = "Session Expired",
  body: string = "Please log in again."
) => {
  if (!deviceTokens || deviceTokens.length === 0) {
    return { success: false, message: "No device tokens provided" };
  }

  try {
    const message: admin.messaging.MulticastMessage = {
      tokens: deviceTokens,
      data: {
        action: "login_redirect", // This is the trigger
      },
      // We omit the `notification` block to keep it silent visually if desired
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];
      response.responses.forEach((res, index) => {
        if (!res.success && res.error) {
          const code = res.error.code;
          const msg = res.error.message || "";
          if (code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-registration-token' ||
              msg.includes('registration-token-not-registered') ||
              msg.includes('invalid-registration-token')) {
            tokensToRemove.push(deviceTokens[index]);
          }
        }
      });
      if (tokensToRemove.length > 0) {
        console.log(`🧹 Removing invalid multicast FCM tokens from DB (Login Redirect):`, tokensToRemove);
        const { User } = require("../models/user.model");
        await User.updateMany({ fcmToken: { $in: tokensToRemove } }, { $set: { fcmToken: "" } });
      }
    }

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error: any) {
    console.error("sendLoginRedirectNotification error:", error);
    return { success: false, message: error.message || "Push send failed" };
  }
};

// Send VOIP Call Notification (High Priority)
export const sendCallNotification = async (
  token: string,
  callerName: string,
  callerImage: string,
  callId: string,
  isVideo: boolean,
  extraData?: Record<string, string>
) => {
  try {
    if (!token) return;

    const message = {
      token: token,
      notification: {
        title: "Incoming Call",
        body: `${callerName} is calling you...`,
      },
      data: {
        type: "call",
        callId: callId,
        callerName: callerName,
        callerImage: callerImage,
        isVideo: String(isVideo),
        uuid: callId,
        ...(extraData || {})
      },
      android: {
        priority: "high" as const,
        ttl: 0, // Immediate delivery
        notification: {
          channelId: "call_channel", // MUST match frontend channel
          sound: "calltune", // valid for resources/raw/calltune.mpeg
          priority: "high" as const,
          visibility: "public" as const,
          icon: "ic_launcher", // ensure this icon exists
          defaultVibrateTimings: true,
        }
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            contentAvailable: true,
            sound: "calltune.wav", // iOS needs .wav or .caf
          },
        },
      },
    };

    await admin.messaging().send(message as any);
    console.log(`Call notification sent to ${token}`);
  } catch (error: any) {
    console.error("sendCallNotification error:", error);
    if (error.code === 'messaging/registration-token-not-registered' ||
        error.code === 'messaging/invalid-registration-token' ||
        error.message?.includes('registration-token-not-registered') ||
        error.message?.includes('invalid-registration-token')) {
      console.log(`🧹 FCM token is not registered or invalid. Removing from DB: ${token}`);
      const { User } = require("../models/user.model");
      await User.updateOne({ fcmToken: token }, { $set: { fcmToken: "" } });
    }
  }
};
