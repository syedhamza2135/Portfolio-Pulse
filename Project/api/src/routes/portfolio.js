import { Router } from 'express';
import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';
import { requireAuth } from '../middleware/auth.js';
import { createPortfolioSchema, updatePortfolioSchema } from '../validation/portfolio.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
    const portfolios = await Portfolio.find({ userId: req.user.sub}).sort({createdAt: 1 });
    res.json(portfolios);
});

router.get('/:id', async (req, res) => {
    const portfolio = await Portfolio.findOne({ _id: req.params.id, userId: req.user.sub });
    if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    // Populate holdings for the portfolio
    const holdings = await Holding.find({ portfolioId: portfolio._id }).sort({ createdAt: 1 });
    const portfolioWithHoldings = portfolio.toObject();
    portfolioWithHoldings.holdings = holdings;
    
    res.json(portfolioWithHoldings);
});

router.post('/', async (req, res) => {
    try {
        const { error, value } = createPortfolioSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.message });
        }

        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Get userId from req.user - try sub first, then _id, then id
        const userId = req.user.sub || req.user._id || req.user.id;
        
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found' });
        }

        // Convert to string if it's an ObjectId
        const userIdString = userId.toString ? userId.toString() : userId;

        const portfolio = await Portfolio.create({ userId: userIdString, ...value });
        res.status(201).json(portfolio);
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: err.message });
        }
        console.error('Error creating portfolio:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id', async (req, res) => {
    const { error, value } = updatePortfolioSchema.validate(req.body);
    if (error){
        return res.status(400).json({ error: error.message });
    }
    
    const portfolio = await Portfolio.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.sub },
        { ...value, lastUpdated: new Date() },
        { new: true }
    );

    if (!portfolio){
        return res.status(404).json( { error: 'Portfolio not found' });
    }

    res.json(portfolio);
});

router.delete('/:id', async (req, res) => {
    const deleted = await Portfolio.findOneAndDelete({ _id: req.params.id, userId: req.user.sub });
    if (!deleted){
        return res.status(404).json({ error: 'Portfolio not found' });
    }
    res.status(204).send();
});

export default router;