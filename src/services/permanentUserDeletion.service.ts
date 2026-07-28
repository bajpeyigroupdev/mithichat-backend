import admin from 'firebase-admin';
import { User } from '../models/user.model';
import { Permission } from '../models/permission.model';
import { AuditLog } from '../models/auditLog.model';
import { BlockedUser } from '../models/blockedUser.model';
import HelpRequest from '../models/help.model';
import DeletionRequest from '../models/deletionRequest.model';
import { getIO, getUserRoom } from '../sockets';
import { APP_ACCOUNT_ROLES } from '../utils/accountScope';

export interface PermanentUserDeletionResult {
  deletedUserId: number;
  deletedMongoId: string;
}

export const permanentlyDeleteUserRecord = async (userToDelete: any): Promise<PermanentUserDeletionResult> => {
  const mongoId = String(userToDelete._id);
  const numericUserId = userToDelete.userId;
  const isAppAccount = APP_ACCOUNT_ROLES.includes(userToDelete.role);

  if (isAppAccount && !admin.apps.length) {
    try {
      await import('../utils/pushNotification');
    } catch (error) {
      console.warn('Firebase lazy initialization failed during permanent user deletion:', error);
    }
  }

  if (isAppAccount && admin.apps.length && userToDelete.phoneNumber) {
    try {
      const firebaseUser = await admin.auth().getUserByPhoneNumber(userToDelete.phoneNumber);
      await admin.auth().deleteUser(firebaseUser.uid);
    } catch (error: any) {
      if (error?.code !== 'auth/user-not-found') {
        console.warn(`Firebase phone cleanup failed for ${userToDelete.phoneNumber}:`, error?.message);
      }
    }
  }

  if (isAppAccount && admin.apps.length && userToDelete.email) {
    try {
      const firebaseUser = await admin.auth().getUserByEmail(userToDelete.email);
      await admin.auth().deleteUser(firebaseUser.uid);
    } catch (error: any) {
      if (error?.code !== 'auth/user-not-found') {
        console.warn(`Firebase email cleanup failed for ${userToDelete.email}:`, error?.message);
      }
    }
  }

  await Promise.all([
    Permission.deleteMany({ targetType: 'user', targetId: mongoId }),
    AuditLog.deleteMany({
      $or: [
        { adminId: userToDelete._id },
        { target: mongoId },
        { target: String(numericUserId) },
      ],
    }),
    BlockedUser.deleteMany({
      $or: [
        { userId: String(numericUserId) },
        { blockedBy: String(numericUserId) },
      ],
    }),
    DeletionRequest.deleteMany({ userId: userToDelete._id }),
    HelpRequest.deleteMany({ userId: numericUserId }),
    User.updateMany(
      { blockedUsers: userToDelete._id },
      { $pull: { blockedUsers: userToDelete._id } }
    ),
  ]);

  const optionalCleanupTasks = [
    async () => {
      const { Kyc } = await import('../models/kyc.model');
      await Kyc.deleteMany({ userId: numericUserId });
    },
    async () => {
      const HostModel = (await import('../models/host.model')).default;
      await HostModel.deleteMany({ hostId: numericUserId });
    },
    async () => {
      const TempHostModel = (await import('../models/temp.host.model')).default;
      await TempHostModel.deleteMany({ userId: numericUserId });
    },
    async () => {
      const { Agency } = await import('../models/agency.model');
      await Agency.deleteMany({ ownerId: userToDelete._id });
    },
  ];

  for (const cleanup of optionalCleanupTasks) {
    try {
      await cleanup();
    } catch (error: any) {
      console.warn('Optional user cleanup failed:', error?.message);
    }
  }

  if (userToDelete.referrerId) {
    await User.findByIdAndUpdate(userToDelete.referrerId, {
      $inc: {
        approvedReferrals: -1,
        totalReferrals: -1,
        activeReferrals: -1,
      },
    }).catch(() => null);
  }

  try {
    const redis = (await import('../configs/redisConfig')).default;
    await redis.srem('online_users', String(numericUserId));
  } catch (error: any) {
    console.warn('Redis user cleanup failed:', error?.message);
  }

  try {
    const io = getIO();
    const userRoom = getUserRoom(String(numericUserId));
    io.to(userRoom).emit('force_logout', { reason: 'Account permanently deleted' });
    io.in(userRoom).disconnectSockets(true);
  } catch (error: any) {
    console.warn('Socket user cleanup failed:', error?.message);
  }

  await User.deleteOne({ _id: userToDelete._id });

  return {
    deletedUserId: numericUserId,
    deletedMongoId: mongoId,
  };
};
