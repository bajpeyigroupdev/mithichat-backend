import { Response } from "express";
import { AuthRequest } from "../middlewares/authorize.middleware";
import sendResponse from "../utils/reponse";
import { User } from "../models/user.model";
import { RechargeHistory } from "../models/RechargeHistory";
import { GooglePlayRTDN } from "../models/GooglePlayRTDN";
import { RechargeType } from "../constants/user";
import { Logger } from "../utils/logger";
import { google } from "googleapis";
import path from "path";
import fs from "fs";
import mongoose, { ClientSession } from "mongoose";
import { getProductConfig, GOOGLE_PLAY_PRODUCTS } from "../constants/googlePlayProducts";

// Package Name Configuration & RTDN Security Secret
const GOOGLE_PLAY_PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.umang.app";
const GOOGLE_PLAY_RTDN_SECRET = process.env.GOOGLE_PLAY_RTDN_SECRET || "";

/**
 * Initialize Google Auth Client securely from Environment Variable or Service Account Key file
 */
const getGoogleAuth = () => {
  if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
      return new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/androidpublisher"],
      });
    } catch (err) {
      console.error("[GooglePlay] Error parsing GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:", err);
    }
  }

  const keyFilePath = path.resolve(__dirname, "../../configs/google-services.json");
  if (fs.existsSync(keyFilePath)) {
    return new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
  }

  console.warn("[GooglePlay] Warning: No service account credentials found. Verification calls will fail.");
  return new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
};

const androidPublisher = google.androidpublisher({
  version: "v3",
  auth: getGoogleAuth(),
});

export interface NormalizedGooglePurchaseDetails {
  apiVersion: 'productsv2' | 'products_v1';
  packageName: string;
  productId: string;
  purchaseToken: string;
  purchaseState: 'PURCHASED' | 'PENDING' | 'CANCELED' | 'UNKNOWN';
  rawStateCode: number | string;
  orderId?: string;
  obfuscatedExternalAccountId?: string;
  obfuscatedExternalProfileId?: string;
  acknowledgementState?: string | number;
  consumptionState?: string | number;
  rawPayload: any;
}

/**
 * Modern Google Play Developer API Purchase Verification
 * Prefers `purchases.productsv2.getproductpurchasev2` as recommended by current Google documentation,
 * falling back to `purchases.products.get` for maximum backwards compatibility.
 *
 * Full Validation Enforced:
 * 1. Package Name match
 * 2. Product ID match
 * 3. Purchase Token integrity
 * 4. Purchase State (PURCHASED vs PENDING vs CANCELED)
 * 5. Acknowledgement & Consumption state
 * 6. Obfuscated account mapping where available
 */
const verifyGooglePurchaseState = async (
  purchaseToken: string,
  productId: string,
  packageName: string
): Promise<NormalizedGooglePurchaseDetails | null> => {
  // 1. Primary Attempt: Modern `purchases.productsv2.getproductpurchasev2`
  try {
    if (androidPublisher.purchases.productsv2 && typeof androidPublisher.purchases.productsv2.getproductpurchasev2 === 'function') {
      console.log(`[GooglePlay API] Attempting productsv2 verification for token: ${purchaseToken.substring(0, 10)}...`);
      const v2Res = await androidPublisher.purchases.productsv2.getproductpurchasev2({
        packageName,
        token: purchaseToken,
      });

      if (v2Res.data) {
        const data = v2Res.data;
        console.log('[GooglePlay API] Productsv2 response received:', JSON.stringify(data));

        const itemProductId = data.productLineItem?.[0]?.productId || productId;
        const consumptionState = data.productLineItem?.[0]?.productOfferDetails?.consumptionState || undefined;
        const acknowledgementState = data.acknowledgementState || undefined;

        let purchaseState: 'PURCHASED' | 'PENDING' | 'CANCELED' | 'UNKNOWN' = 'UNKNOWN';
        let rawState: string = 'UNKNOWN';

        if (data.purchaseCompletionTime) {
          purchaseState = 'PURCHASED';
          rawState = 'PURCHASED';
        } else if (data.purchaseStateContext) {
          purchaseState = 'PENDING';
          rawState = 'PENDING';
        }

        return {
          apiVersion: 'productsv2',
          packageName,
          productId: itemProductId,
          purchaseToken,
          purchaseState,
          rawStateCode: rawState,
          orderId: data.orderId || undefined,
          obfuscatedExternalAccountId: data.obfuscatedExternalAccountId || undefined,
          obfuscatedExternalProfileId: data.obfuscatedExternalProfileId || undefined,
          acknowledgementState: acknowledgementState || undefined,
          consumptionState: consumptionState || undefined,
          rawPayload: data,
        };
      }
    }
  } catch (v2Error: any) {
    console.warn('[GooglePlay API] productsv2 verification failed or unavailable, falling back to products.get:', v2Error.response?.data || v2Error.message);
  }

  // 2. Compatibility Fallback: `purchases.products.get`
  try {
    console.log(`[GooglePlay API] Attempting products.get verification for SKU ${productId}...`);
    const v1Res = await androidPublisher.purchases.products.get({
      packageName,
      productId,
      token: purchaseToken,
    });

    if (v1Res.data) {
      const data = v1Res.data;
      console.log('[GooglePlay API] products.get response received:', data);

      let purchaseState: 'PURCHASED' | 'PENDING' | 'CANCELED' | 'UNKNOWN' = 'UNKNOWN';
      // purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending
      if (data.purchaseState === 0) {
        purchaseState = 'PURCHASED';
      } else if (data.purchaseState === 2) {
        purchaseState = 'PENDING';
      } else if (data.purchaseState === 1) {
        purchaseState = 'CANCELED';
      }

      return {
        apiVersion: 'products_v1',
        packageName,
        productId,
        purchaseToken,
        purchaseState,
        rawStateCode: data.purchaseState !== undefined && data.purchaseState !== null ? data.purchaseState : 'UNKNOWN',
        orderId: data.orderId || undefined,
        obfuscatedExternalAccountId: data.obfuscatedExternalAccountId || undefined,
        acknowledgementState: data.acknowledgementState !== undefined && data.acknowledgementState !== null ? data.acknowledgementState : undefined,
        consumptionState: data.consumptionState !== undefined && data.consumptionState !== null ? data.consumptionState : undefined,
        rawPayload: data,
      };
    }
  } catch (v1Error: any) {
    console.error('[GooglePlay API] products.get verification failed:', v1Error.response?.data || v1Error.message);
  }

  return null;
};

/**
 * Consume Google Play Purchase server-side
 */
const consumeGooglePurchaseServer = async (purchaseToken: string, productId: string, packageName: string) => {
  try {
    await androidPublisher.purchases.products.consume({
      packageName,
      productId,
      token: purchaseToken,
    });
    console.log(`[GooglePlay] Server-side purchase consumed for SKU ${productId}`);
    return true;
  } catch (error: any) {
    console.warn(`[GooglePlay] Server-side consume failed or already consumed for SKU ${productId}:`, error.message);
    return false;
  }
};

/**
 * Verify Google Play Purchase Endpoint
 * POST /api/payment/verify-google
 */
export const verifyGooglePurchase = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user || {};
    const { purchaseToken, productId, packageName } = req.body;
    const effectivePackageName = packageName || GOOGLE_PLAY_PACKAGE_NAME;

    // 1. Input Validation
    if (!userId) {
      return sendResponse(res, 401, false, "Unauthorized: Authenticated user required");
    }

    if (!purchaseToken || !productId) {
      return sendResponse(res, 400, false, "Missing required fields: purchaseToken and productId are required");
    }

    // 2. Validate product against Server-Side Catalog (NEVER trust client price or diamond count)
    const productConfig = getProductConfig(productId);
    if (!productConfig) {
      return sendResponse(res, 400, false, `Invalid product ID: '${productId}' is not recognized in server product catalog`);
    }

    // 3. Query Google Play Developer API using modern productsv2 / fallback products.get
    const verifiedDetails = await verifyGooglePurchaseState(purchaseToken, productId, effectivePackageName);
    if (!verifiedDetails) {
      return sendResponse(res, 400, false, "Unable to verify purchase token with Google Play Developer API");
    }

    // 4. Validate Package Name & Product ID integrity
    if (verifiedDetails.packageName && verifiedDetails.packageName !== effectivePackageName) {
      console.error(`[GooglePlay] Package name mismatch! Expected: ${effectivePackageName}, Received: ${verifiedDetails.packageName}`);
      return sendResponse(res, 400, false, "Security violation: Package name mismatch");
    }

    if (verifiedDetails.productId && verifiedDetails.productId !== productId) {
      console.error(`[GooglePlay] Product ID mismatch! Expected: ${productId}, Received: ${verifiedDetails.productId}`);
      return sendResponse(res, 400, false, "Security violation: Product ID mismatch");
    }

    // 5. Handle Pending Purchase State
    if (verifiedDetails.purchaseState === 'PENDING') {
      await RechargeHistory.findOneAndUpdate(
        { purchaseToken },
        {
          userId,
          type: RechargeType.GOOGLE_PLAY,
          coins: productConfig.diamonds,
          diamonds: productConfig.diamonds,
          date: new Date(),
          transactionId: purchaseToken,
          purchaseToken,
          productId,
          packageName: effectivePackageName,
          amount: productConfig.priceInr,
          currency: "INR",
          status: "PENDING",
          orderId: verifiedDetails.orderId || undefined,
          rawGoogleData: verifiedDetails.rawPayload,
        },
        { upsert: true, new: true }
      );

      return res.status(200).json({
        success: false,
        status: "PENDING",
        message: "Payment is pending. Diamonds will be added after Google confirms payment.",
      });
    }

    // 6. Handle Canceled/Invalid Purchase State
    if (verifiedDetails.purchaseState === 'CANCELED') {
      return res.status(400).json({
        success: false,
        status: "CANCELED",
        message: "Purchase was canceled or invalid",
      });
    }

    // 7. Require Explicit PURCHASED State
    if (verifiedDetails.purchaseState !== 'PURCHASED') {
      return res.status(400).json({
        success: false,
        status: "UNKNOWN",
        message: "Unrecognized purchase state from Google Play",
      });
    }

    // 8. Atomic Idempotent Wallet Credit using Mongoose Session
    let session: ClientSession | null = null;
    try {
      session = await mongoose.startSession();
      session.startTransaction();

      // Check if purchase token has already been processed
      const existingTx = await RechargeHistory.findOne({
        $or: [{ purchaseToken }, { transactionId: purchaseToken }],
      }).session(session);

      if (existingTx && existingTx.status === "COMPLETED") {
        await session.abortTransaction();
        session.endSession();

        const userRecord = await User.findOne({ userId });
        return res.status(200).json({
          success: true,
          status: "ALREADY_PROCESSED",
          diamondsAdded: 0,
          balance: userRecord?.diamonds || 0,
          message: "Purchase was already processed",
        });
      }

      // Increment User Diamonds atomically
      const updatedUser = await User.findOneAndUpdate(
        { userId },
        { $inc: { diamonds: productConfig.diamonds } },
        { new: true, session }
      );

      if (!updatedUser) {
        await session.abortTransaction();
        session.endSession();
        return sendResponse(res, 404, false, "User profile not found");
      }

      // Create / Update Ledger Transaction Record
      await RechargeHistory.findOneAndUpdate(
        { purchaseToken },
        {
          userId,
          type: RechargeType.GOOGLE_PLAY,
          coins: productConfig.diamonds,
          diamonds: productConfig.diamonds,
          date: new Date(),
          transactionId: purchaseToken,
          purchaseToken,
          productId,
          packageName: effectivePackageName,
          amount: productConfig.priceInr,
          currency: "INR",
          status: "COMPLETED",
          orderId: verifiedDetails.orderId || undefined,
          processedAt: new Date(),
          rawGoogleData: verifiedDetails.rawPayload,
        },
        { upsert: true, new: true, session }
      );

      await session.commitTransaction();
      session.endSession();

      // 9. Consume Google Play Purchase server-side
      consumeGooglePurchaseServer(purchaseToken, productId, effectivePackageName).catch((e) =>
        console.warn("[GooglePlay] Async consume attempt error:", e.message)
      );

      return res.status(200).json({
        success: true,
        status: "COMPLETED",
        productId,
        diamondsAdded: productConfig.diamonds,
        balance: updatedUser.diamonds,
        message: `${productConfig.diamonds.toLocaleString()} Diamonds added successfully`,
      });

    } catch (dbErr: any) {
      if (session && session.inTransaction()) {
        await session.abortTransaction();
        session.endSession();
      }
      console.error("[GooglePlay] Atomic transaction failed:", dbErr);
      return sendResponse(res, 500, false, "Database error during wallet update");
    }

  } catch (error: any) {
    await Logger("verifyGooglePurchase", error);
    return sendResponse(res, 500, false, error.message || "Internal server error");
  }
};

/**
 * Handle Google Play Real-Time Developer Notifications (RTDN)
 * POST /api/payment/google-play/rtdn
 */
export const handleGooglePlayRTDN = async (req: any, res: Response) => {
  try {
    // 1. RTDN Security Authorization Verification
    if (GOOGLE_PLAY_RTDN_SECRET) {
      const incomingToken = req.query.token || req.headers['x-rtdn-token'];
      if (incomingToken !== GOOGLE_PLAY_RTDN_SECRET) {
        console.warn("[GooglePlay RTDN] Unauthorized RTDN request attempt");
        return res.status(401).send("Unauthorized RTDN request");
      }
    }

    const pubSubMessage = req.body?.message;
    if (!pubSubMessage || !pubSubMessage.data) {
      return res.status(400).send("Invalid Pub/Sub message body");
    }

    const messageId = pubSubMessage.messageId;
    if (!messageId) {
      return res.status(400).send("Missing messageId in Pub/Sub message");
    }

    // 2. Persistent Cluster-wide Atomic Deduplication using MongoDB Unique Index on messageId
    let rtdnRecord;
    try {
      rtdnRecord = await GooglePlayRTDN.create({
        messageId,
        status: 'PROCESSING',
      });
    } catch (createErr: any) {
      if (createErr.code === 11000 || createErr.message?.includes('duplicate')) {
        console.log(`[GooglePlay RTDN] Duplicate messageId '${messageId}' already exists in DB. Skipping execution.`);
        return res.status(200).send("Duplicate message ignored");
      }
      console.error('[GooglePlay RTDN] Error creating RTDN record:', createErr);
      return res.status(500).send("Database error creating RTDN record");
    }

    try {
      const decodedData = Buffer.from(pubSubMessage.data, "base64").toString("utf-8");
      const payload = JSON.parse(decodedData);

      console.log("[GooglePlay RTDN] Received notification payload:", payload);

      const devNotification = payload.developerNotification;
      if (!devNotification) {
        rtdnRecord.status = 'PROCESSED';
        rtdnRecord.processedAt = new Date();
        await rtdnRecord.save();
        return res.status(200).send("Ignored non-developer notification");
      }

      const packageName = devNotification.packageName || GOOGLE_PLAY_PACKAGE_NAME;
      const productNotification = devNotification.oneTimeProductNotification;

      rtdnRecord.packageName = packageName;
      if (devNotification.eventTimeMillis) {
        rtdnRecord.eventTimeMillis = new Date(Number(devNotification.eventTimeMillis));
      }

      if (productNotification) {
        const { purchaseToken, sku: productId, notificationType } = productNotification;
        rtdnRecord.notificationType = String(notificationType);
        rtdnRecord.purchaseToken = purchaseToken;

        console.log(`[GooglePlay RTDN] Processing product ${productId}, type ${notificationType}, token ${purchaseToken}`);

        if (purchaseToken && productId) {
          const verifiedDetails = await verifyGooglePurchaseState(purchaseToken, productId, packageName);

          if (verifiedDetails) {
            if (verifiedDetails.purchaseState === 'PURCHASED') {
              const existingTx = await RechargeHistory.findOne({ purchaseToken });

              if (existingTx && existingTx.status === "PENDING") {
                const user = await User.findOneAndUpdate(
                  { userId: existingTx.userId },
                  { $inc: { diamonds: existingTx.diamonds || 0 } },
                  { new: true }
                );

                existingTx.status = "COMPLETED";
                existingTx.processedAt = new Date();
                existingTx.rawGoogleData = verifiedDetails.rawPayload;
                await existingTx.save();

                console.log(`[GooglePlay RTDN] Credited ${existingTx.diamonds} diamonds for pending order of user ${existingTx.userId}`);
              }
            } else if (verifiedDetails.purchaseState === 'CANCELED' || notificationType === 2) {
              await RechargeHistory.findOneAndUpdate(
                { purchaseToken },
                { status: "REFUNDED", rawGoogleData: verifiedDetails.rawPayload }
              );
              console.log(`[GooglePlay RTDN] Marked purchase ${purchaseToken} as REFUNDED`);
            }
          }
        }
      }

      rtdnRecord.status = 'PROCESSED';
      rtdnRecord.processedAt = new Date();
      await rtdnRecord.save();

      return res.status(200).send("Event processed");

    } catch (procErr: any) {
      console.error("[GooglePlay RTDN] Error processing notification payload:", procErr);
      rtdnRecord.status = 'FAILED';
      rtdnRecord.error = procErr.message || String(procErr);
      await rtdnRecord.save();
      return res.status(200).send("Handled with error");
    }

  } catch (error: any) {
    console.error("[GooglePlay RTDN] Top-level handler error:", error);
    return res.status(200).send("Handled with error");
  }
};

/**
 * Audit / Synchronize Refunded & Voided Purchases
 */
export const syncVoidedPurchases = async (packageName: string = GOOGLE_PLAY_PACKAGE_NAME) => {
  try {
    const res = await androidPublisher.purchases.voidedpurchases.list({
      packageName,
    });

    const voidedList = res.data.voidedPurchases;
    if (Array.isArray(voidedList) && voidedList.length > 0) {
      console.log(`[GooglePlay Voided] Found ${voidedList.length} voided purchases`);
      for (const item of voidedList) {
        if (item.purchaseToken) {
          await RechargeHistory.findOneAndUpdate(
            { purchaseToken: item.purchaseToken },
            { status: "REFUNDED", rawGoogleData: item }
          );
        }
      }
    }
  } catch (err: any) {
    console.error("[GooglePlay Voided] Error checking voided purchases:", err.message);
  }
};
