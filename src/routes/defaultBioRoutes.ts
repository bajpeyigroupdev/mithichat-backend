import { Router } from 'express';
import {
  getDefaultBios,
  createDefaultBio,
  updateDefaultBio,
  deleteDefaultBio,
} from '../controllers/defaultBioController';
import { verifyToken } from '../middlewares/authorize.middleware';

const router = Router();

// Public / App Endpoint
router.get('/', getDefaultBios);

// Admin Endpoints
router.post('/', verifyToken, createDefaultBio);
router.put('/:id', verifyToken, updateDefaultBio);
router.delete('/:id', verifyToken, deleteDefaultBio);

export default router;
