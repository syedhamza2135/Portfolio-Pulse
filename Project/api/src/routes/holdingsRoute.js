import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createHolding, deleteHolding, getHoldingbyID, getHoldings, updateHolding } from '../controllers/holdingsController.js';

const router = Router();
router.use(requireAuth);

router.get('/', getHoldings);
router.get('/:id', getHoldingbyID);
router.post('/', createHolding);
router.put('/:id', updateHolding);
router.delete('/:id', deleteHolding);

export default router;