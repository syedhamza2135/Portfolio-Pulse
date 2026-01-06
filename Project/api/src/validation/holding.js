import Joi from 'joi';

const MONGODB_OBJECTID_LENGTH = 24;

export const createHoldingSchema = Joi.object({
    portfolioId: Joi.string().hex().length(MONGODB_OBJECTID_LENGTH).required(),
    ticker: Joi.string().uppercase().min(1).max(15).required(),
    assetType: Joi.string().valid('stock', 'crypto', 'etf').required(),
    quantity: Joi.number().positive().required().messages({ 'number.positive': 'Quantity must be greater than 0. To remove a holding, use DELETE.' }),
    averageCost: Joi.number().precision(4).min(0).required(),
    currentPrice: Joi.number().precision(4).min(0).optional()
});

export const updateHoldingSchema = Joi.object({
    quantity: Joi.number().positive().optional().messages({ 'number.positive': 'Quantity must be greater than 0. To remove a holding, use DELETE.' }),
    averageCost: Joi.number().precision(4).min(0).optional(),
    currentPrice: Joi.number().precision(4).min(0).optional()
}).min(1);