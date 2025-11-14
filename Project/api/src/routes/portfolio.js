import { Router } from 'express';
import Portfolio from '../models/portfolio.js';
import { requireAuth } from '../middleware/auth.js';
import { createPortfolioSchema, updatePortfolioSchema } from '../validation/portfolio.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
    const portfolios = await Portfolio.find({ userId: req.user.sub}).sort({createdAt: 1 });
    res.json(portfolios);
});

router.post('/', async (req, res) => {
    const { error, value } = createPortfolioSchema.validate(req.body);
    if(error){
        return res.status(400).json({ error: error.message });
    }

    const portfolio = await Portfolio.create({ userId: req.user.sub, ...value});
    res.status(201).json(portfolio);
});

router.put('/:id', async (req, res) => {
    const { error, value } = updatePortfolioSchema.validate(req.body);
    if (error){
        return res.status(400).json({ error: error.message });
    }
    
    const portfolio = await Portfolio.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.sub },
        { ...value, lastUpdated: newDate() },
        { new: true }
    );

    if (!portfolio){
        return res.status(404).json( { error: 'Portfolio not found' });
    }

    res.status.json(portfolio);
});

router.delete('/:id', async (req, res) => {
    const deleted = await Portfolio.findOneAndDelete({ _id: req.params.id, userId: req.user.sub });
    if (!deleted){
        return res.status(404).json({ error: 'Portfolio not found' });
    }
    res.status(204).send();
});

export default router;