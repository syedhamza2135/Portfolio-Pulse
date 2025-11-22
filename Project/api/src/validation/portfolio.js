import Joi from 'joi';

export const createPortfolioSchema = Joi.object({
    name: Joi.string().max(120).required(),
    description: Joi.string().max(500).allow('').optional()
});

export const updatePortfolioSchema = Joi.object({
    name: Joi.string().max(120).optional(),
    description: Joi.string().max(500).allow('').optional()
});