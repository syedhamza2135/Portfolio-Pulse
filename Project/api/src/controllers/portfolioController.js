/**
 * Portfolio Controller
 * 
 * Handles CRUD operations for investment portfolios.
 * 
 * Features:
 * - User-scoped portfolio access (users can only access their own portfolios)
 * - Automatic holdings inclusion in portfolio details
 * - Transaction support for portfolio deletion (cascades to holdings)
 * - Input validation using Joi schemas
 * 
 * @module controllers/portfolioController
 * @requires mongoose
 */

import mongoose from "mongoose";
import Portfolio from "../models/portfolio.js";
import Holding from "../models/holdings.js";
import {
  createPortfolioSchema,
  updatePortfolioSchema,
} from "../validation/portfolio.js";
import { getPortfolioValueSummary } from "../services/portfolioCalculation.js";
import { getUserId } from "../utils/authHelpers.js";

/**
 * Centralized error handler for portfolio controller
 * 
 * Provides consistent error handling and logging across all controller methods.
 * 
 * @function handleControllerError
 * @param {Object} res - Express response object
 * @param {Error} err - Error object
 * @param {string} context - Context description for logging (e.g., "fetch portfolios")
 * 
 * @returns {Object} Error response with appropriate status code
 */
const handleControllerError = (res, err, context) => {
  console.error(`[PortfolioController] ${context}:`, err);
  // Determine status code: use error.status if available, 400 for CastError, 500 otherwise
  const status = err.status || (err.name === "CastError" ? 400 : 500);
  const message = err.message || `Failed to ${context}`;
  return res.status(status).json({ error: message });
};

/**
 * Retrieves all portfolios for the authenticated user
 * 
 * Returns portfolios sorted by creation date (oldest first).
 * Only returns portfolios owned by the authenticated user.
 * 
 * @async
 * @function getPortfolios
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * @returns {Array} 200 - Array of portfolio objects
 * @throws {500} If database operation fails
 */
export async function getPortfolios(req, res) {
  try {
    // Fetch all portfolios for the authenticated user
    // Using .lean() for better performance (returns plain objects)
    // Sorted by creation date (oldest first)
    const portfolios = await Portfolio.find({ userId: getUserId(req) }).sort({ createdAt: 1 }).lean();
    res.json(portfolios);
  } catch (err) {
    handleControllerError(res, err, "fetch portfolios");
  }
}

/**
 * Retrieves a specific portfolio by ID with all its holdings
 * 
 * Security: Verifies user owns the portfolio before returning data.
 * Includes all holdings associated with the portfolio.
 * 
 * @async
 * @function getPortfoliobyID
 * @param {Object} req - Express request object
 * @param {string} req.params.id - Portfolio ID
 * @param {Object} res - Express response object
 * 
 * @returns {Object} 200 - Portfolio object with holdings array
 * @throws {404} If portfolio not found or user doesn't own it
 * @throws {500} If database operation fails
 */
export async function getPortfoliobyID(req, res) {
  try {
    // Find portfolio by ID and verify ownership
    const portfolio = await Portfolio.findOne({ _id: req.params.id, userId: getUserId(req) }).lean();
    if (!portfolio) return res.status(404).json({ error: "Portfolio not found" });

    // Fetch all holdings for this portfolio
    // Holdings are sorted by creation date (oldest first)
    portfolio.holdings = await Holding.find({ portfolioId: portfolio._id }).sort({ createdAt: 1 }).lean();
    
    // Enrich with calculated summary
    portfolio.summary = await getPortfolioValueSummary(portfolio._id);
    
    res.json(portfolio);
  } catch (err) {
    handleControllerError(res, err, "fetch portfolio");
  }
}

/**
 * Creates a new portfolio for the authenticated user
 * 
 * Process:
 * 1. Validates request body using Joi schema
 * 2. Creates portfolio with user ID from JWT token
 * 3. Returns created portfolio
 * 
 * @async
 * @function createPortfolio
 * @param {Object} req - Express request object
 * @param {Object} req.body - Portfolio data (name, description)
 * @param {Object} res - Express response object
 * 
 * @returns {Object} 201 - Created portfolio object
 * @throws {400} If validation fails
 * @throws {500} If database operation fails
 */
export async function createPortfolio(req, res) {
  try {
    // Validate request body against schema
    const { error, value } = createPortfolioSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    // Create portfolio with authenticated user's ID
    const portfolio = await Portfolio.create({ userId: getUserId(req), ...value });
    res.status(201).json(portfolio);
  } catch (err) {
    handleControllerError(res, err, "create portfolio");
  }
}

/**
 * Updates an existing portfolio
 * 
 * Security: Verifies user owns the portfolio before updating.
 * Automatically updates lastUpdated timestamp.
 * 
 * @async
 * @function updatePortfolio
 * @param {Object} req - Express request object
 * @param {string} req.params.id - Portfolio ID to update
 * @param {Object} req.body - Updated portfolio data
 * @param {Object} res - Express response object
 * 
 * @returns {Object} 200 - Updated portfolio object
 * @throws {400} If validation fails
 * @throws {404} If portfolio not found or user doesn't own it
 * @throws {500} If database operation fails
 */
export async function updatePortfolio(req, res) {
  try {
    // Validate request body
    const { error, value } = updatePortfolioSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    // Update portfolio (only if user owns it)
    // new: true returns updated document
    // runValidators: true ensures schema validation runs
    const portfolio = await Portfolio.findOneAndUpdate(
      { _id: req.params.id, userId: getUserId(req) },
      { ...value },
      { new: true, runValidators: true }
    );

    if (!portfolio) return res.status(404).json({ error: "Portfolio not found" });
    res.json(portfolio);
  } catch (err) {
    handleControllerError(res, err, "update portfolio");
  }
}

/**
 * Deletes a portfolio and all its holdings
 * 
 * Uses MongoDB transactions to ensure atomicity:
 * - If portfolio deletion succeeds but holdings deletion fails, transaction rolls back
 * - Prevents orphaned holdings
 * 
 * Security: Verifies user owns the portfolio before deletion.
 * 
 * @async
 * @function deletePortfolio
 * @param {Object} req - Express request object
 * @param {string} req.params.id - Portfolio ID to delete
 * @param {Object} res - Express response object
 * 
 * @returns {void} 204 - No content (successful deletion)
 * @throws {404} If portfolio not found or user doesn't own it
 * @throws {500} If database operation fails
 */
export async function deletePortfolio(req, res) {
  const session = await mongoose.startSession();
  try {
    // Use transaction to ensure atomicity
    // If any operation fails, all changes are rolled back
    await session.withTransaction(async () => {
      // Delete portfolio (only if user owns it)
      const portfolio = await Portfolio.findOneAndDelete(
        { _id: req.params.id, userId: getUserId(req) },
        { session }
      );
      if (!portfolio) throw { status: 404, message: "Portfolio not found" };

      // Cascade delete: Remove all holdings in this portfolio
      // This prevents orphaned holdings
      await Holding.deleteMany({ portfolioId: portfolio._id }, { session });
    });
    res.status(204).send();
  } catch (err) {
    handleControllerError(res, err, "delete portfolio");
  } finally {
    // Always end session, even if transaction fails
    session.endSession();
  }
}