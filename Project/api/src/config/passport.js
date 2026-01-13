/**
 * Passport Authentication Configuration
 * 
 * Configures Passport.js authentication strategies:
 * - Local Strategy: Email/password authentication
 * - JWT Strategy: Token-based authentication for API requests
 * 
 * @module config/passport
 * @requires passport-local
 * @requires passport-jwt
 * @requires bcrypt
 */

import passportLocal from "passport-local";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import bcrypt from "bcrypt";
import User from "../models/user.js";

const LocalStrategy = passportLocal.Strategy;

/**
 * Sets up Passport authentication strategies
 * 
 * Configures two authentication strategies:
 * 1. Local Strategy: For email/password login
 *    - Normalizes email (lowercase, trim)
 *    - Compares password with bcrypt hash
 * 
 * 2. JWT Strategy: For token-based API authentication
 *    - Extracts token from Authorization header
 *    - Validates token signature
 *    - Loads user from database
 * 
 * @function setupPassport
 * @param {Object} passport - Passport instance
 * @returns {Object} Configured passport instance
 */
export default function setupPassport(passport) {
  // Local Strategy: Email/Password Authentication
  // Used for login endpoint
  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          // Normalize email (lowercase and trim)
          // Ensures consistent storage and lookup
          const normalizedEmail = email.toLowerCase().trim();

          // Find user by email
          const user = await User.findOne({ email: normalizedEmail });
          if (!user) {
            // Generic error message to prevent email enumeration
            return done(null, false, { message: "Invalid credentials" });
          }

          // Compare provided password with stored hash
          // bcrypt.compare handles timing-safe comparison
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) {
            return done(null, false, { message: "Invalid credentials" });
          }

          // Authentication successful - return user object
          return done(null, user);
        } catch (err) {
          console.error("LocalStrategy error:", err);
          return done(err);
        }
      }
    )
  );

  // JWT Strategy: Token-based Authentication
  // Used for protected API endpoints
  const opts = {
    // Extract JWT from Authorization header as Bearer token
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    // Secret key for verifying token signature
    secretOrKey: process.env.JWT_SECRET,
  };

  passport.use(
    new JwtStrategy(opts, async (payload, done) => {
      try {
        // Extract user ID from JWT payload (standard 'sub' claim)
        const id = payload.sub;
        if (!id) {
          return done(null, false);
        }

        // Load user from database (excluding password hash)
        const user = await User.findById(id).select("-passwordHash");
        if (user) {
          return done(null, user);
        }

        // User not found (may have been deleted)
        return done(null, false);
      } catch (err) {
        console.error("JwtStrategy error:", err);
        return done(err, false);
      }
    })
  );

  return passport;
}
