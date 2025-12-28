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
router.use(requireAuth);

// Stats routes - MUST come before /:id routes
router.get('/stats', getPortfolioStats);
router.get('/:id/stats', getPortfolioDetailedStats);

// Standard CRUD routes
router.get('/', getPortfolios);
router.get('/:id', getPortfoliobyID);
router.post('/', createPortfolio);
router.put('/:id', updatePortfolio);
router.delete('/:id', deletePortfolio);

export default router;