import { Router } from 'express';
import {
  submitAvatarRequest,
  getAvatarRequests,
  approveAvatarRequest,
  rejectAvatarRequest,
} from '../controllers/avatarRequestController';
import { verifyToken } from '../middlewares/authorize.middleware';

const router = Router();

// Host submit avatar request
router.post('/', verifyToken, submitAvatarRequest);

// Admin endpoints
router.get('/', verifyToken, getAvatarRequests);
router.put('/:id/approve', verifyToken, approveAvatarRequest);
router.put('/:id/reject', verifyToken, rejectAvatarRequest);

export default router;
