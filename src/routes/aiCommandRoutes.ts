import { Router } from 'express';
import { verifyToken, checkPermission } from '../middlewares/authorize.middleware';
import { askAdminCommand, getAdminOperationsSnapshot } from '../controllers/aiCommandController';

const router = Router();
router.get('/snapshot', verifyToken, checkPermission('Dashboard', 'view'), getAdminOperationsSnapshot);
router.post('/query', verifyToken, checkPermission('Dashboard', 'view'), askAdminCommand);
export default router;
