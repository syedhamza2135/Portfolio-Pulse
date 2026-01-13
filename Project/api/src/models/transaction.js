/**
 * Transaction Model
 * 
 * Stores transaction history for portfolio operations.
 * 
 * Schema Fields:
 * - portfolio: Reference to portfolio
 * - holding: Reference to holding (optional, for buy/sell transactions)
 * - user: Reference to user who executed the transaction
 * - type: Transaction type (buy, sell, transfer)
 * - ticker: Asset symbol (for transactions without holding reference)
 * - quantity: Number of shares/units
 * - price: Price per unit at time of transaction
 * - executedAt: When the transaction was executed
 * 
 * Indexes:
 * - portfolio: For querying portfolio transaction history
 * - user: For querying user transaction history
 * 
 * Note: This model is prepared for future transaction tracking features.
 * Currently, transactions are not automatically created but the schema is ready.
 * 
 * @module models/transaction
 * @requires mongoose
 */

import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    // Reference to portfolio
    portfolio: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Portfolio', 
      required: true, 
      index: true  // Indexed for portfolio transaction queries
    },
    // Reference to holding (optional - may not exist for new holdings)
    holding: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Holding' 
    },
    // Reference to user who executed the transaction
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true  // Indexed for user transaction queries
    },
    // Transaction type
    type: { 
      type: String, 
      enum: ['buy', 'sell', 'transfer'], 
      required: true 
    },
    // Asset symbol (for transactions without holding reference)
    ticker: { 
      type: String, 
      trim: true, 
      uppercase: true
    },
    // Number of shares/units in transaction
    quantity: { 
      type: Number, 
      required: true, 
      min: 0  // Cannot be negative
    },
    // Price per unit at time of transaction
    price: { 
      type: Number, 
      required: true, 
      min: 0  // Cannot be negative
    },
    // When the transaction was executed
    executedAt: { 
      type: Date, 
      default: Date.now 
    }
  },
  { 
    timestamps: true  // Automatically adds createdAt and updatedAt
  }
);

export default mongoose.model('Transaction', transactionSchema);