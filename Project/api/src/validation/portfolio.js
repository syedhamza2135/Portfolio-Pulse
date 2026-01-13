/**
 * Portfolio Validation Schemas
 * 
 * Defines Joi validation schemas for portfolio creation and updates.
 * Ensures data integrity and prevents invalid input.
 * 
 * @module validation/portfolio
 * @requires joi
 */

import Joi from 'joi';

/**
 * Validation schema for creating a new portfolio
 * 
 * Requirements:
 * - name: Required, max 120 characters
 * - description: Optional, max 500 characters, can be empty string
 * 
 * @constant {Joi.ObjectSchema} createPortfolioSchema
 */
export const createPortfolioSchema = Joi.object({
    name: Joi.string().max(120).required(),
    description: Joi.string().max(500).allow('').optional()
});

/**
 * Validation schema for updating an existing portfolio
 * 
 * Requirements:
 * - name: Optional, max 120 characters (if provided)
 * - description: Optional, max 500 characters, can be empty string (if provided)
 * 
 * Note: At least one field must be provided (enforced by controller)
 * 
 * @constant {Joi.ObjectSchema} updatePortfolioSchema
 */
export const updatePortfolioSchema = Joi.object({
    name: Joi.string().max(120).optional(),
    description: Joi.string().max(500).allow('').optional()
});