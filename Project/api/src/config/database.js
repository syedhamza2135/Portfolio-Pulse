/**
 * Database Configuration and Utilities
 * 
 * Provides database initialization, validation, and maintenance functions:
 * - Index creation for optimal query performance
 * - Database connection validation
 * - Development cleanup utilities
 * 
 * @module config/database
 * @requires mongoose
 */

import mongoose from 'mongoose';
import User from '../models/user.js';
import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';
import SentimentData from '../models/sentimentData.js';
import RiskMetrics from '../models/riskMetrics.js';
import PriceHistory from '../models/priceHistory.js';

/**
 * Ensures all database indexes are created
 * 
 * Indexes are critical for query performance. This function:
 * - Creates indexes defined in model schemas
 * - Verifies indexes exist after creation
 * - Logs index count for each collection
 * 
 * Should be run:
 * - Once after initial deployment
 * - After schema changes that affect indexes
 * - During database migrations
 * 
 * @async
 * @function ensureIndexes
 * @returns {Promise<void>}
 * @throws {Error} If index creation fails
 */
export async function ensureIndexes() {
  console.log('[Database] Creating indexes...');
  
  try {
    // Create indexes for all models
    await Promise.all([
      User.createIndexes(),
      Portfolio.createIndexes(),
      Holding.createIndexes(),
      SentimentData.createIndexes(),
      RiskMetrics.createIndexes(),
      PriceHistory.createIndexes()
    ]);
    
    console.log('✓ All indexes created successfully');
    
    // List all indexes for verification
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    for (const collection of collections) {
      const indexes = await mongoose.connection.db
        .collection(collection.name)
        .listIndexes()
        .toArray();
      
      console.log(`  ${collection.name}: ${indexes.length} indexes`);
    }
    
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    throw error;
  }
}

/**
 * Validates database connection and configuration
 * 
 * Performs health checks on the database connection:
 * - Verifies connection state
 * - Pings database to ensure it's responsive
 * - Checks for required collections (warns if missing)
 * 
 * Used during application startup to ensure database is ready.
 * 
 * @async
 * @function validateDatabase
 * @returns {Promise<boolean>} True if validation passes, false otherwise
 */
export async function validateDatabase() {
  try {
    // Check connection state
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database not connected');
    }
    
    // Ping database
    await mongoose.connection.db.admin().ping();
    
    // Check if collections exist
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    const requiredCollections = ['users', 'portfolios', 'holdings'];
    const missingCollections = requiredCollections.filter(
      name => !collectionNames.includes(name)
    );
    
    if (missingCollections.length > 0) {
      console.warn(`⚠ Missing collections: ${missingCollections.join(', ')}`);
      console.warn('  These will be created on first use');
    }
    
    console.log('✓ Database validation passed');
    return true;
    
  } catch (error) {
    console.error('❌ Database validation failed:', error.message);
    return false;
  }
}

/**
 * Database cleanup utility (for development only)
 * 
 * WARNING: This function deletes ALL data from all collections.
 * Only available in non-production environments for safety.
 * 
 * Use cases:
 * - Resetting test database
 * - Development environment cleanup
 * - Testing data migration scripts
 * 
 * @async
 * @function cleanupDatabase
 * @returns {Promise<void>}
 * @throws {Error} If called in production environment
 */
export async function cleanupDatabase() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot cleanup database in production');
  }
  
  console.log('⚠ Cleaning up database...');
  
  await Promise.all([
    User.deleteMany({}),
    Portfolio.deleteMany({}),
    Holding.deleteMany({}),
    SentimentData.deleteMany({}),
    RiskMetrics.deleteMany({}),
    PriceHistory.deleteMany({})
  ]);
  
  console.log('✓ Database cleaned');
}