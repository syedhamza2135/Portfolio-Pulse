/**
 * Holding Validation Schemas
 * 
 * Defines Joi validation schemas for holding creation and updates.
 * Ensures data integrity and prevents invalid input.
 * 
 * @module validation/holding
 * @requires joi
 */

import Joi from 'joi';

// MongoDB ObjectId is always 24 hexadecimal characters
const MONGODB_OBJECTID_LENGTH = 24;

/**
 * Validation schema for creating a new holding
 * 
 * Requirements:
 * - portfolioId: Required, valid MongoDB ObjectId (24 hex characters)
 * - ticker: Required, 1-15 characters, automatically uppercased
 * - assetType: Required, must be 'stock', 'crypto', or 'etf'
 * - quantity: Required, must be positive (greater than 0)
 * - averageCost: Required, min 0, 4 decimal precision
 * - currentPrice: Optional, min 0, 4 decimal precision
 * 
 * @constant {Joi.ObjectSchema} createHoldingSchema
 */
export const createHoldingSchema = Joi.object({
    portfolioId: Joi.string().hex().length(MONGODB_OBJECTID_LENGTH).required(),
    ticker: Joi.string().uppercase().min(1).max(15).required(),
    assetType: Joi.string().valid('stock', 'crypto', 'etf').required(),
    quantity: Joi.number().positive().required().messages({ 
        'number.positive': 'Quantity must be greater than 0. To remove a holding, use DELETE.' 
    }),
    averageCost: Joi.number().precision(4).min(0).required(),
    currentPrice: Joi.number().precision(4).min(0).optional()
});

/**
 * Validation schema for updating an existing holding
 * 
 * Requirements:
 * - quantity: Optional, must be positive if provided
 * - averageCost: Optional, min 0, 4 decimal precision if provided
 * - currentPrice: Optional, min 0, 4 decimal precision if provided
 * 
 * Note: At least one field must be provided (.min(1) enforces this)
 * 
 * @constant {Joi.ObjectSchema} updateHoldingSchema
 */
export const updateHoldingSchema = Joi.object({
    quantity: Joi.number().positive().optional().messages({ 
        'number.positive': 'Quantity must be greater than 0. To remove a holding, use DELETE.' 
    }),
    averageCost: Joi.number().precision(4).min(0).optional(),
    currentPrice: Joi.number().precision(4).min(0).optional()
}).min(1);  // At least one field must be provided