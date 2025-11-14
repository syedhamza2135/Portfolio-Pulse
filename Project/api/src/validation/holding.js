import Joi from 'joi';

export const createHoldingSchema = Joi.object({
    portfolioId: Joi.string().hex().length(24).required(),
    ticker: Joi.string().uppercase().max(10).required(),
    assetType: Joi.string().valid('stock', 'crypto', 'etf').required(),
    quantity: Joi.number().positive().required(),
    averageCost: Joi.number().precision(4).min(0).required()
});

export const updateHoldingSchema = Joi.object({
    quantity: Joi.number().positive().optional(),
    averageCost: Joi.number().precision(4).min(0).optional()
}).min(1);