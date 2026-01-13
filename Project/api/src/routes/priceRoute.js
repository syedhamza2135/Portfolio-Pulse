/**
 * Price Routes
 * 
 * Defines endpoints for fetching and refreshing market prices:
 * - GET /api/prices/ticker/:ticker - Get current price for a ticker (public, rate-limited)
 * - POST /api/prices/holdings/:id/refresh - Refresh price for a specific holding (authenticated)
 * - POST /api/prices/portfolios/:id/refresh - Refresh prices for all holdings in a portfolio (authenticated)
 * 
 * Note: Ticker price endpoint is public but rate-limited to prevent abuse.
 * 
 * @module routes/priceRoute
 * @requires express
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { 
  refreshHoldingPrice,
  refreshPortfolioPrices,
  getTickerPrice
} from '../controllers/priceController.js';

const router = Router();

// Public endpoint (with rate limiting applied at app level)
// Allows price lookup without authentication for convenience
router.get('/ticker/:ticker', getTickerPrice);

// Protected endpoints - require authentication
router.use(requireAuth);
router.post('/holdings/:id/refresh', refreshHoldingPrice);    // Refresh single holding price
router.post('/portfolios/:id/refresh', refreshPortfolioPrices); // Refresh all portfolio prices

export default router;