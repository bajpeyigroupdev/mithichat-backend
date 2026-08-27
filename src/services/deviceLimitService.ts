import { User } from '../models/user.model';
import { DeviceLimit } from '../models/deviceLimit.model';
import { DeviceRegistrationLock } from '../models/deviceRegistrationLock.model';
import { getCachedSettings } from '../controllers/settingsController';
import { APP_ACCOUNT_ROLES } from '../utils/accountScope';

export interface DeviceCheckResult {
  allowed: boolean;
  code?: string;
  message?: string;
  maxAllowed?: number;
  existingCount?: number;
  lockAcquired?: boolean;
}

/**
 * Checks if a device is eligible to register a new account.
 * Optionally acquires an atomic MongoDB lock to prevent simultaneous race conditions.
 */
export async function checkAndLockDeviceRegistration(
  deviceId: string,
  userId?: number,
  acquireLock: boolean = false
): Promise<DeviceCheckResult> {
  const cleanDeviceId = String(deviceId || '').trim();

  if (!cleanDeviceId) {
    return {
      allowed: false,
      code: "DEVICE_ID_REQUIRED",
      message: "Device ID is required for account registration."
    };
  }

  // 1. Fetch custom device limit override or default limit (1)
  const customLimit = await DeviceLimit.findOne({ deviceId: cleanDeviceId }).lean();
  const settings = await getCachedSettings();
  const maxAllowed = customLimit ? customLimit.maxAllowedAccounts : (settings?.defaultMaxAccountsPerDevice || 1);

  // 2. Count active registered accounts from this device
  const existingCount = await User.countDocuments({
    $or: [
      { "device.createdDeviceId": cleanDeviceId },
      { "device.currentDeviceId": cleanDeviceId },
      { deviceId: cleanDeviceId }
    ],
    role: { $in: APP_ACCOUNT_ROLES },
    isDeleted: false,
  });

  // 3. Reject if limit reached
  if (existingCount >= maxAllowed) {
    return {
      allowed: false,
      code: "DEVICE_REGISTRATION_LIMIT_REACHED",
      message: `Registration limit reached for this device (Limit: ${maxAllowed}). Contact Admin to increase your device registration limit.`,
      maxAllowed,
      existingCount
    };
  }

  // 4. If atomic lock requested (during actual account creation):
  if (acquireLock) {
    const targetIndex = existingCount + 1;
    try {
      await DeviceRegistrationLock.create({
        deviceId: cleanDeviceId,
        accountIndex: targetIndex,
        userId: userId || 0
      });
    } catch (err: any) {
      if (err.code === 11000) {
        // Race condition detected! Simultaneous request acquired targetIndex
        return {
          allowed: false,
          code: "DEVICE_REGISTRATION_LIMIT_REACHED",
          message: `Registration limit reached for this device (Limit: ${maxAllowed}). Contact Admin to increase your device registration limit.`,
          maxAllowed,
          existingCount
        };
      }
      throw err;
    }
  }

  return {
    allowed: true,
    maxAllowed,
    existingCount,
    lockAcquired: acquireLock
  };
}
