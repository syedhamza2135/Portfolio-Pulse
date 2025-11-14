import Joi from 'joi';

export const createPortfolioSchema = Joi.object({
    name: Joi.string().max(120).required()
});

export const updatePortfolioSchema = Joi.object({
    name: Joi.string().max(120).optional()
});