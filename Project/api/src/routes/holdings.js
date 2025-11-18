import { Router } from 'express';
import Holding from '../models/holdings.js';
import Portfolio from '../models/portfolio.js';
import { requireAuth } from '../middleware/auth.js';
import { createHoldingSchema, updateHoldingSchema } from '../validation/holding.js';

const router = Router();
router.use(requireAuth);

async function ensurePortfolio(req, res, next){
    const portfolio = await Portfolio.findOne({ _id: req.body.portfolioId ?? req.params.portfolioId, userId: req.user.sub });
    if (!portfolio){
        return res.status(404).json({error: 'Portfolio not found' });
    }
    req.portfolio = portfolio;
    next();
}

router.get('/', async(req, res) => {
    const portfolioId = req.query.portfolioId;
    if (!portfolioId){
        return res.status(400).json({ error: 'portfolioId is required' });
    }

    const portfolio = await Portfolio.findOne({ _id: portfolioId, userId: req.user.sub });
    if (!portfolio){
        return res.status(404).json({ error: 'Portfolio not found' });
    }

    const holdings = await Holding.find({ portfolioId }).sort({ createdAt: 1 });
    res.json(holdings);
});

router.post('/', ensurePortfolio, async (req, res) => {
    const { error, value } = createHoldingSchema.validate(req.body);
    if (error){
        return res.status(400).json({ error: error.message });
    }

    const holding = await Holding.create({ ...value, portfolioId: req.portfolio.id });
    res.status(201).json(holding);
});

router.put('/:id', async (req, res) => {
    const { error, value } = updateHoldingSchema.validate(req.body);
    if (error){
        return res.status(400).json({ error: error.message });
    }

    const holding = await Holding.findById(req.params.id);
    if (!holding){
        return res.status(404).json({ error: 'Holding not found' });
    }

    const portfolio = await Portfolio.findOne({ _id: holding.portfolioId, userId: req.user.sub });
    if (!portfolio){
        return res.status(403).json({ error: 'Forbidden' });
    }

    Object.assign(holding, value, { updatedAt: new Date() });
    await holding.save();
    res.json(holding);
});

router.delete('/:id', async (req, res) => {
    const holding = await Holding.findById(req.params.id);
    if (!holding){
        return res.status(404).json({ message: 'Holding not found' });
    }

    const portfolio = await Portfolio.findOne({ _id: holding.portfolioId, userId: req.user.sub });
    if (!portfolio){
        return res.status(403).json({ error: 'Forbidden' });
    }

    await holding.deleteOne();
    res.status(204).send();
});

export default router;