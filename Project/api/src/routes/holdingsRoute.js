/**
 * Holdings Routes
 * 
 * Defines authenticated holding management endpoints:
 * - GET /api/holdings?portfolioId=xxx - Get all holdings for a portfolio
 * - GET /api/holdings/:id - Get specific holding by ID
 * - POST /api/holdings - Create new holding
 * - PUT /api/holdings/:id - Update holding
 * - DELETE /api/holdings/:id - Delete holding
 * 
 * All routes require authentication via JWT token.
 * Users can only access holdings in portfolios they own.
 * 
 * @module routes/holdingsRoute
 * @requires express
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createHolding, deleteHolding, getHoldingbyID, getHoldings, updateHolding } from '../controllers/holdingsController.js';

const router = Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Holdings CRUD operations
router.get('/', getHoldings);        // List holdings (requires portfolioId query param)
router.get('/:id', getHoldingbyID);   // Get holding by ID
router.post('/', createHolding);     // Create new holding
router.put('/:id', updateHolding);    // Update holding
router.delete('/:id', deleteHolding); // Delete holding

export default router;