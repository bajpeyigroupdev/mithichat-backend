import { Router } from 'express';
import { verifyToken } from '../middlewares/authorize.middleware';
import {
    verifyUserForSeller,
    rechargeUserBySeller,
    getSellerDashboard,
    getSellerHistory,
    getSellerLedger,
    requestStockBySeller,
    getSellerStockRequests,
    getSellerConfig
} from '../controllers/sellerController';

const router = Router();

// Public / Authenticated Config
router.get('/config', getSellerConfig);

// Protected Seller Portal Endpoints
router.use(verifyToken);

router.get('/users/:userId', verifyUserForSeller);
router.post('/recharge', rechargeUserBySeller);
router.get('/dashboard', getSellerDashboard);
router.get('/history', getSellerHistory);
router.get('/ledger', getSellerLedger);
router.post('/stock/request', requestStockBySeller);
router.get('/stock/requests', getSellerStockRequests);

export default router;
