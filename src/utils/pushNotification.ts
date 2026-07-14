import admin from "firebase-admin";
import path from "path";
import fs from "fs";

// ✅ initialize once
if (!admin.apps.length) {
  try {
    const credentialCandidates = [
      path.resolve(process.cwd(), "src/configs/serviceAccountKey.json"),
      path.resolve(process.cwd(), "configs/serviceAccountKey.json"),
      path.resolve(__dirname, "../configs/serviceAccountKey.json"),
    ];
    const credentialPath = credentialCandidates.find(candidate => fs.existsSync(candidate));
    if (!credentialPath) throw new Error('Firebase service account file not found');
    admin.initializeApp({
      credential: admin.credential.cert(
        // 🧠 Changed to serviceAccountKey.json (Server Key) instead of google-services.json (Android Key)
        // Also fixed path: __dirname (utils) -> .. (src) -> configs -> serviceAccountKey.json
        credentialPath
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
      // Chat notifications are rendered locally by Notifee so messages from
      // the same conversation can be grouped and expose Reply/Mark read.
      // Other notification types can still use Firebase's system rendering.
      ...(payload.data?.type === 'message' ? {} : {
        notification: {
          title: payload.title,
          body: payload.body,
        },
      }),
      android: { priority: "high" },
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
    if (!token) return { success: false, error: "missing-token" };

    const message = {
      token: token,
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
        ttl: 30000, // Deliver immediately, discard stale calls after 30 seconds.
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

    const messageId = await admin.messaging().send(message as any);
    console.log(`Call notification sent successfully: ${messageId}`);
    return { success: true, messageId };
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
    return { success: false, error: error.code || error.message || "push-send-failed" };
  }
};

export const sendMissedCallNotification = async (
  token: string,
  callerName: string,
  callerImage: string,
  targetUserId: string = ''
) => sendPushNotification([token], {
  title: 'Missed call',
  body: `You missed a call from ${callerName}`,
  data: {
    type: 'missed_call',
    action: 'open_activity',
    callerName,
    callerImage,
    targetUserId,
  },
});
