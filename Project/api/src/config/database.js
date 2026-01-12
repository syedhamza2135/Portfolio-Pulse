import mongoose from 'mongoose';
import User from '../models/user.js';
import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';
import SentimentData from '../models/sentimentData.js';
import RiskMetrics from '../models/riskMetrics.js';
import PriceHistory from '../models/priceHistory.js';

/**
 * Ensures all database indexes are created
 * Run this once after initial deployment or schema changes
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
 * Database cleanup utility (for development)
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