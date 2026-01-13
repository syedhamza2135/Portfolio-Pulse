/**
 * Portfolio Routes
 * 
 * Defines authenticated portfolio management endpoints:
 * - GET /api/portfolios - List all user's portfolios
 * - GET /api/portfolios/:id - Get specific portfolio with holdings
 * - POST /api/portfolios - Create new portfolio
 * - PUT /api/portfolios/:id - Update portfolio
 * - DELETE /api/portfolios/:id - Delete portfolio and all holdings
 * - GET /api/portfolios/stats - Get aggregated stats for all portfolios
 * - GET /api/portfolios/:id/stats - Get detailed stats for specific portfolio
 * 
 * All routes require authentication via JWT token.
 * 
 * @module routes/portfolioRoute
 * @requires express
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { 
  createPortfolio, 
  deletePortfolio, 
  getPortfoliobyID, 
  getPortfolios, 
  updatePortfolio 
} from '../controllers/portfolioController.js';
import { 
  getPortfolioStats, 
  getPortfolioDetailedStats 
} from '../controllers/portfolioStatsController.js';

const router = Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Stats routes - MUST come before /:id routes to avoid route conflicts
// Express matches routes in order, so more specific routes must come first
router.get('/stats', getPortfolioStats);           // Aggregated stats for all portfolios
router.get('/:id/stats', getPortfolioDetailedStats); // Detailed stats for one portfolio

// Standard CRUD routes
router.get('/', getPortfolios);        // List all portfolios
router.get('/:id', getPortfoliobyID);  // Get portfolio by ID
router.post('/', createPortfolio);     // Create new portfolio
router.put('/:id', updatePortfolio);   // Update portfolio
router.delete('/:id', deletePortfolio); // Delete portfolio (cascades to holdings)

export default router;