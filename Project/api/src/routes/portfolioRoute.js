import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createPortfolio, deletePortfolio, getPortfoliobyID, getPortfolios, updatePortfolio } from '../controllers/portfolioController.js';

const router = Router();
router.use(requireAuth);

router.get('/', getPortfolios);
router.get('/:id', getPortfoliobyID);
router.post('/', createPortfolio);
router.put('/:id', updatePortfolio);
router.delete('/:id', deletePortfolio);

export default router;