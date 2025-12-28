// routes/priceRoute.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { 
  refreshHoldingPrice,
  refreshPortfolioPrices,
  getTickerPrice
} from '../controllers/priceController.js';

const router = Router();

// Public endpoint (with rate limiting)
router.get('/ticker/:ticker', getTickerPrice);

// Protected endpoints
router.use(requireAuth);
router.post('/holdings/:id/refresh', refreshHoldingPrice);
router.post('/portfolios/:id/refresh', refreshPortfolioPrices);

export default router;