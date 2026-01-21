/**
 * Portfolio Model
 * 
 * Represents a user's investment portfolio containing multiple holdings.
 * 
 * Schema Fields:
 * - userId: Reference to the user who owns this portfolio
 * - name: Portfolio name (required)
 * - description: Optional portfolio description
 * - totalValue: Current total value of all holdings (calculated)
 * - dailyChange: Change in value from initial investment (calculated)
 * - lastUpdated: Timestamp of last value recalculation
 * 
 * Virtual Fields:
 * - returnPercent: Calculated return percentage
 * 
 * Indexes:
 * - userId: For fast user portfolio queries
 * - userId + createdAt: For sorted user portfolio lists
 * 
 * @module models/portfolio
 * @requires mongoose
 */

import mongoose from 'mongoose';

const portfolioSchema = new mongoose.Schema({
    // Reference to user who owns this portfolio
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true  // Indexed for fast user portfolio queries
    },
    // Portfolio name
    name: { 
        type: String, 
        required: true, 
        trim: true  // Remove leading/trailing whitespace
    },
    // Optional portfolio description
    description: { 
        type: String, 
        trim: true, 
        default: ''
    },
    // Current total value of all holdings (calculated from holdings)
    totalValue: { 
        type: Number, 
        default: 0
    },
    // Change in value from initial investment (calculated)
    dailyChange: { 
        type: Number, 
        default: 0
    }
}, {
    timestamps: true,  // Automatically adds createdAt and updatedAt
    toJSON: { virtuals: true },  // Include virtuals in JSON output
    toObject: { virtuals: true }  // Include virtuals in object output
});

/**
 * Virtual field: Return percentage
 * 
 * Calculates the percentage return on investment.
 * Formula: (dailyChange / initialInvestment) * 100
 * 
 * @virtual
 * @returns {number} Return percentage (0 if totalValue is 0 or invalid)
 */
portfolioSchema.virtual('returnPercent').get(function() {
    if (this.totalValue === 0) return 0;
    const investment = this.totalValue - this.dailyChange;
    return investment > 0 ? (this.dailyChange / investment) * 100 : 0;
});

// Compound index for efficient user portfolio queries sorted by creation date
portfolioSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Portfolio', portfolioSchema);