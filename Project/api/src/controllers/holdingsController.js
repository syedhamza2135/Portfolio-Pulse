/**
 * Holdings Controller
 *
 * Handles CRUD operations for investment holdings within portfolios.
 *
 * Features:
 * - Ownership verification (users can only access their own holdings)
 * - Transaction support for data consistency
 * - Automatic portfolio value recalculation
 * - Optimistic concurrency control with retry logic
 * - Timeout protection for long-running operations
 *
 * @module controllers/holdingsController
 * @requires mongoose
 */

import mongoose from "mongoose";
import {
  createHoldingSchema,
  updateHoldingSchema,
} from "../validation/holding.js";
import Holding from "../models/holdings.js";
import Portfolio from "../models/portfolio.js";
import { recalculatePortfolioValues } from "../services/portfolioCalculation.js";
import { getUserId } from "../utils/authHelpers.js";

const handleControllerError = (res, err, context) => {
  console.error(`[HoldingController] ${context}:`, err);
  const status = err.status || (err.name === "CastError" ? 400 : 500);
  const message = err.message || `Failed to ${context}`;
  
  if (err.message === "Portfolio not found or access denied") {
    return res.status(404).json({ error: message });
  }
  if (err.message === "Invalid portfolio ID format") {
    return res.status(400).json({ error: message });
  }
  if (err.message === "Invalid holding ID format") {
    return res.status(400).json({ error: message });
  }
  if (err.message === "Holding not found") {
    return res.status(404).json({ error: message });
  }
  if (err.message === "Access denied") {
    return res.status(403).json({ error: message });
  }
  if (err.code === 11000) {
    return res.status(409).json({
      error: "A holding with this ticker already exists in this portfolio",
    });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: message });
  }

  return res.status(status).json({ error: message });
};


/**
 * Verifies that a portfolio belongs to the specified user
 *
 * This is a security check to prevent unauthorized access to portfolios.
 * Used before any portfolio-related operations.
 *
 * @async
 * @function verifyPortfolioOwnership
 * @param {string} portfolioId - Portfolio ID to verify
 * @param {string} userId - User ID to check ownership against
 * @param {mongoose.ClientSession} [session=null] - Optional MongoDB session for transactions
 *
 * @returns {Promise<Object>} Portfolio document if ownership is verified
 * @throws {Error} If portfolio ID is invalid or user doesn't own the portfolio
 */
async function verifyPortfolioOwnership(portfolioId, userId, session = null) {
  if (!mongoose.Types.ObjectId.isValid(portfolioId)) {
    throw new Error("Invalid portfolio ID format");
  }

  const queryOptions = session ? { session } : {};
  const portfolio = await Portfolio.findOne(
    { _id: portfolioId, userId },
    null,
    queryOptions
  );

  if (!portfolio) {
    throw new Error("Portfolio not found or access denied");
  }
  return portfolio;
}

/**
 * Verifies that a holding belongs to a portfolio owned by the specified user
 *
 * This is a security check to prevent unauthorized access to holdings.
 * Verifies both the holding exists and the user owns the parent portfolio.
 *
 * @async
 * @function verifyHoldingOwnership
 * @param {string} holdingId - Holding ID to verify
 * @param {string} userId - User ID to check ownership against
 * @param {mongoose.ClientSession} [session=null] - Optional MongoDB session for transactions
 *
 * @returns {Promise<Object>} Object containing holding and portfolio documents
 * @returns {Object} return.holding - Holding document
 * @returns {Object} return.portfolio - Portfolio document
 *
 * @throws {Error} If holding ID is invalid, holding not found, or access denied
 */
async function verifyHoldingOwnership(holdingId, userId, session = null) {
  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(holdingId)) {
    throw new Error("Invalid holding ID format");
  }

  const queryOptions = session ? { session } : {};

  // Find holding by ID
  const holding = await Holding.findById(holdingId, null, queryOptions);

  if (!holding) {
    throw new Error("Holding not found");
  }

  // Verify user owns the portfolio that contains this holding
  const portfolio = await Portfolio.findOne(
    { _id: holding.portfolioId, userId },
    null,
    queryOptions
  );

  if (!portfolio) {
    throw new Error("Access denied");
  }

  return { holding, portfolio };
}

/**
 * Updates a holding with optimistic concurrency control and retry logic
 *
 * Handles write conflicts that can occur in high-concurrency scenarios.
 * Uses MongoDB's optimistic concurrency control (version field) to detect conflicts.
 *
 * @async
 * @function updateHoldingWithRetry
 * @param {Object} holding - Mongoose holding document to update
 * @param {Object} value - New values to apply to the holding
 * @param {mongoose.ClientSession} session - MongoDB session for transaction
 * @param {number} [retries=3] - Maximum number of retry attempts
 *
 * @returns {Promise<Object>} Updated holding document
 * @throws {Error} If update fails after all retries
 */
async function updateHoldingWithRetry(holding, value, session, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      // Apply new values to holding
      Object.assign(holding, value);

      // Update price timestamp if price was changed
      if (value.currentPrice !== undefined) {
        holding.lastPriceUpdate = new Date();
      }

      // Save with session (for transaction support)
      await holding.save({ session });
      return holding;
    } catch (error) {
      // Handle write conflicts (error code 112 = WriteConflict)
      // This happens when another operation modified the document concurrently
      if (error.code === 112 && i < retries - 1) {
        console.warn(`[Holding] Write conflict, retry ${i + 1}/${retries}`);
        // Reload the holding to get latest version
        await holding.reload({ session });
        if (!holding) {
          throw new Error("Holding was deleted during update");
        }
        continue; // Retry with fresh data
      }
      throw error; // Re-throw if not a write conflict or out of retries
    }
  }
}

/**
 * Retrieves all holdings for a specific portfolio
 *
 * Security: Verifies user owns the portfolio before returning holdings.
 *
 * @async
 * @function getHoldings
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.portfolioId - Portfolio ID to fetch holdings for
 * @param {Object} res - Express response object
 *
 * @returns {Array} 200 - Array of holding objects
 * @throws {400} If portfolioId is missing or invalid
 * @throws {404} If portfolio not found or user doesn't own it
 * @throws {500} If database operation fails
 */
export async function getHoldings(req, res) {
  try {
    const { portfolioId } = req.query;

    // Validate portfolioId is provided
    if (!portfolioId) {
      return res
        .status(400)
        .json({ error: "portfolioId query parameter is required" });
    }

    // Verify user owns the portfolio (security check)
    const userId = getUserId(req);
    await verifyPortfolioOwnership(portfolioId, userId);

    // Fetch all holdings for the portfolio
    // Using .lean() for better performance (returns plain objects, not Mongoose documents)
    // Sorted by creation date (oldest first)
    const holdings = await Holding.find({ portfolioId })
      .sort({ createdAt: 1 })
      .lean();

    res.json(holdings);
  } catch (err) {
    handleControllerError(res, err, "fetch holdings");
  }
}

export async function getHoldingbyID(req, res) {
  try {
    const userId = getUserId(req);
    const { holding } = await verifyHoldingOwnership(req.params.id, userId);
    res.json(holding);
  } catch (err) {
    handleControllerError(res, err, "fetch holding");
  }
}

export async function createHolding(req, res) {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: "primary",
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority" },
    maxTimeMS: 10000, // 10 second timeout
  };

  session.startTransaction(transactionOptions);

  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Transaction timeout")), 12000);
    });

    const operationPromise = (async () => {
      const { error, value } = createHoldingSchema.validate(req.body);
      if (error) {
        await session.abortTransaction();
        return res.status(400).json({ error: error.message });
      }

      const userId = getUserId(req);

      await verifyPortfolioOwnership(value.portfolioId, userId, session);

      value.ticker = value.ticker.toUpperCase();
      const holding = await Holding.create([value], { session });

      await recalculatePortfolioValues(value.portfolioId, session);

      await session.commitTransaction();
      res.status(201).json(holding[0]);
    })();

    await Promise.race([operationPromise, timeoutPromise]);
  } catch (err) {
    await session.abortTransaction();
    handleControllerError(res, err, "create holding");
  } finally {
    session.endSession();
  }
}

export async function updateHolding(req, res) {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: "primary",
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority" },
    maxTimeMS: 10000, // 10 second timeout
  };

  session.startTransaction(transactionOptions);

  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Transaction timeout")), 12000);
    });

    const operationPromise = (async () => {
      const { error, value } = updateHoldingSchema.validate(req.body);
      if (error) {
        await session.abortTransaction();
        return res.status(400).json({ error: error.message });
      }

      const userId = getUserId(req);

      const { holding } = await verifyHoldingOwnership(
        req.params.id,
        userId,
        session
      );

      Object.assign(holding, value);

      if (value.currentPrice !== undefined) {
        holding.lastPriceUpdate = new Date();
      }

      await updateHoldingWithRetry(holding, value, session);
      await recalculatePortfolioValues(holding.portfolioId, session);

      await session.commitTransaction();
      res.json(holding);
    })();

    await Promise.race([operationPromise, timeoutPromise]);
  } catch (err) {
    await session.abortTransaction();
    handleControllerError(res, err, "update holding");
  } finally {
    session.endSession();
  }
}

export async function deleteHolding(req, res) {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: "primary",
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority" },
    maxTimeMS: 10000, // 10 second timeout
  };

  session.startTransaction(transactionOptions);

  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Transaction timeout")), 12000);
    });

    const operationPromise = (async () => {
      const userId = getUserId(req);

      const { holding } = await verifyHoldingOwnership(
        req.params.id,
        userId,
        session
      );

      const portfolioId = holding.portfolioId;
      await holding.deleteOne({ session });
      await recalculatePortfolioValues(portfolioId, session);

      await session.commitTransaction();
      res.status(204).send();
    })();

    await Promise.race([operationPromise, timeoutPromise]);
  } catch (err) {
    await session.abortTransaction();
    handleControllerError(res, err, "delete holding");
  } finally {
    session.endSession();
  }
}