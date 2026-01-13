/**
 * User Model
 * 
 * Represents a user account in the system.
 * 
 * Schema Fields:
 * - email: User's email address (unique, indexed, normalized)
 * - passwordHash: Bcrypt hash of user's password (never returned in queries)
 * - preferences: User preferences object
 *   - alertThreshold: Percentage change threshold for alerts (default: 3%)
 *   - emailEnabled: Whether email alerts are enabled (default: true)
 * 
 * Security:
 * - Password is stored as bcrypt hash, never as plain text
 * - Email is always normalized (lowercase, trimmed)
 * - Pre-find hook ensures email queries are normalized
 * 
 * Indexes:
 * - email: Unique index for fast lookups and uniqueness constraint
 * 
 * @module models/user
 * @requires mongoose
 */

import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // User email address (unique identifier)
    email: {
      type: String,
      unique: true,      // Enforces uniqueness at database level
      index: true,       // Indexed for fast lookups
      required: true,
      lowercase: true,   // Always store in lowercase
      trim: true,        // Remove whitespace
    },
    // Bcrypt hash of user password
    // NEVER return this field in queries (use .select('-passwordHash'))
    passwordHash: {
      type: String,
      required: true,
    },
    // User preferences for alerts and notifications
    preferences: {
      alertThreshold: { type: Number, default: 3 },      // Alert threshold in percentage
      emailEnabled: { type: Boolean, default: true },   // Email alerts enabled by default
    },
  },
  { timestamps: true }  // Automatically adds createdAt and updatedAt
);

/**
 * Pre-find hook: Normalize email in queries
 * 
 * Ensures that email queries are always normalized (lowercase, trimmed).
 * This prevents issues where users might query with different casing.
 * 
 * @hook pre-findOne
 */
userSchema.pre("findOne", function (next) {
  if (this._conditions.email) {
    this._conditions.email = this._conditions.email.toLowerCase().trim();
  }
  next();
});

export default mongoose.model("User", userSchema);
