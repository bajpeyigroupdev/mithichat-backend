import { Request, Response } from 'express';
import AvatarRequest, { AvatarRequestStatus } from '../models/avatarRequest.model';
import { User } from '../models/user.model';
import Host from '../models/host.model';
import Notification from '../models/notification.model';
import sendResponse from '../utils/reponse';
import { AuthRequest } from '../middlewares/authorize.middleware';

// 1. Submit Avatar Verification Request (Verified Host)
export const submitAvatarRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestedAvatar } = req.body;
    const authUserId = req.user?.userId;

    if (!requestedAvatar) {
      return sendResponse(res, 400, false, 'Requested avatar URL is required');
    }

    const user = await User.findOne({ userId: authUserId, isDeleted: false });
    if (!user) {
      return sendResponse(res, 404, false, 'User account not found');
    }

    // Verify host role
    if (user.role !== 'host') {
      return sendResponse(res, 403, false, 'Only verified hosts can submit avatar requests');
    }

    // Check existing pending request
    const existingPending = await AvatarRequest.findOne({
      hostId: user.userId,
      status: AvatarRequestStatus.PENDING,
    });

    if (existingPending) {
      return sendResponse(res, 400, false, 'You already have a pending avatar verification request');
    }

    const newRequest = new AvatarRequest({
      hostId: user.userId,
      hostUserObjId: user._id,
      currentAvatar: user.image || '',
      requestedAvatar,
      status: AvatarRequestStatus.PENDING,
    });

    await newRequest.save();

    // Create Notification
    await Notification.create({
      userId: user._id,
      title: 'Avatar Request Submitted',
      message: 'Your avatar update request has been submitted and is under admin review.',
      type: 'system',
    });

    return sendResponse(res, 201, true, 'Avatar verification request submitted successfully', newRequest);
  } catch (error: any) {
    return sendResponse(res, 500, false, error?.message || 'Server error submitting avatar request');
  }
};

// 2. Get Avatar Verification Requests (Admin Panel)
export const getAvatarRequests = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (status) {
      query.status = status;
    }

    const requests = await AvatarRequest.find(query)
      .populate('hostUserObjId', 'name userId email phoneNumber image')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AvatarRequest.countDocuments(query);

    return sendResponse(res, 200, true, 'Avatar requests fetched successfully', {
      requests,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    return sendResponse(res, 500, false, error?.message || 'Server error fetching avatar requests');
  }
};

// 3. Approve Avatar Request (Admin)
export const approveAvatarRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const adminObjId = req.user?.id;

    const avatarReq = await AvatarRequest.findById(id);
    if (!avatarReq) {
      return sendResponse(res, 404, false, 'Avatar request not found');
    }

    if (avatarReq.status !== AvatarRequestStatus.PENDING) {
      return sendResponse(res, 400, false, `Request already ${avatarReq.status}`);
    }

    avatarReq.status = AvatarRequestStatus.APPROVED;
    avatarReq.reviewedBy = adminObjId as any;
    avatarReq.reviewedAt = new Date();
    await avatarReq.save();

    // Update User image & Host profilePhoto automatically
    await User.updateOne(
      { userId: avatarReq.hostId },
      { $set: { image: avatarReq.requestedAvatar } }
    );

    await Host.updateOne(
      { hostId: avatarReq.hostId },
      { $set: { profilePhoto: avatarReq.requestedAvatar } }
    );

    // Notify Host
    await Notification.create({
      userId: avatarReq.hostUserObjId,
      title: 'Avatar Request Approved 🎉',
      message: 'Your avatar change request has been approved and updated on your profile.',
      type: 'system',
    });

    return sendResponse(res, 200, true, 'Avatar request approved successfully', avatarReq);
  } catch (error: any) {
    return sendResponse(res, 500, false, error?.message || 'Server error approving avatar request');
  }
};

// 4. Reject Avatar Request (Admin)
export const rejectAvatarRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminObjId = req.user?.id;

    const avatarReq = await AvatarRequest.findById(id);
    if (!avatarReq) {
      return sendResponse(res, 404, false, 'Avatar request not found');
    }

    if (avatarReq.status !== AvatarRequestStatus.PENDING) {
      return sendResponse(res, 400, false, `Request already ${avatarReq.status}`);
    }

    avatarReq.status = AvatarRequestStatus.REJECTED;
    avatarReq.rejectReason = reason || 'Avatar image does not meet community guidelines';
    avatarReq.reviewedBy = adminObjId as any;
    avatarReq.reviewedAt = new Date();
    await avatarReq.save();

    // Notify Host
    await Notification.create({
      userId: avatarReq.hostUserObjId,
      title: 'Avatar Request Rejected ❌',
      message: `Your avatar change request was rejected. Reason: ${avatarReq.rejectReason}`,
      type: 'system',
    });

    return sendResponse(res, 200, true, 'Avatar request rejected', avatarReq);
  } catch (error: any) {
    return sendResponse(res, 500, false, error?.message || 'Server error rejecting avatar request');
  }
};
