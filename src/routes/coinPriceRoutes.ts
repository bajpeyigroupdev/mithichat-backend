import { Router } from 'express';
import {
  addPricePlan,
  getAllPricePlans,
  getPricePlanById,
  updatePricePlan,
  deletePricePlan
} from '../controllers/coinPriceController';
import { verifyToken } from '../middlewares/authorize.middleware';


const router = Router();

router.post('/', verifyToken, addPricePlan);
router.get('/', verifyToken, getAllPricePlans);
router.get('/:id', verifyToken, getPricePlanById);
router.put('/:id', verifyToken, updatePricePlan);
router.delete('/:id', verifyToken, deletePricePlan);

export default router;
