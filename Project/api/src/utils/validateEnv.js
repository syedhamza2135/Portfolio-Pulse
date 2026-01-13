/**
 * Environment Variable Validation
 * 
 * Validates all required and optional environment variables on application startup.
 * Ensures the application has all necessary configuration before starting.
 * 
 * @module utils/validateEnv
 */

/**
 * Validates environment variables and returns configuration object
 * 
 * This function:
 * 1. Checks for required environment variables (throws if missing)
 * 2. Warns about missing optional variables
 * 3. Validates format and strength of critical variables
 * 4. Returns validated configuration object
 * 
 * Required Variables:
 * - MONGO_URI: MongoDB connection string
 * - JWT_SECRET: Secret key for JWT token signing (min 32 chars recommended)
 * - NODE_ENV: Environment (development, production, test)
 * 
 * Optional Variables:
 * - PORT: Server port (defaults to 5000)
 * - CORS_ORIGIN: Allowed CORS origins (defaults to '*')
 * - ALPHA_VANTAGE_API_KEY: Stock price API key
 * - FINNHUB_API_KEY: Alternative stock price API key
 * 
 * @function validateEnvironment
 * @returns {Object} Configuration object with validated settings
 * @throws {Error} If required variables are missing or invalid
 * 
 * @example
 * const config = validateEnvironment();
 * // Returns: { hasAlphaVantage: true, hasFinnhub: false, corsOrigin: '*', nodeEnv: 'production', port: 5000 }
 */
export function validateEnvironment() {
  // Required variables - application will not start without these
  const required = [
    'MONGO_URI',      // MongoDB connection string
    'JWT_SECRET',     // JWT signing secret
    'NODE_ENV'        // Environment identifier
  ];

  // Optional variables - application will start but with limited functionality
  const optional = [
    'PORT',                    // Server port
    'CORS_ORIGIN',            // CORS allowed origins
    'ALPHA_VANTAGE_API_KEY',  // Stock price API key
    'FINNHUB_API_KEY'          // Alternative stock price API key
  ];

  const missing = [];
  const warnings = [];

  // Check required variables
  required.forEach(key => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });

  // Fail fast if required variables are missing
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    throw new Error('Required environment variables are not set');
  }

  // Check optional but recommended variables
  optional.forEach(key => {
    if (!process.env[key]) {
      warnings.push(key);
    }
  });

  // Warn about missing optional variables
  if (warnings.length > 0) {
    console.warn('⚠ Optional environment variables not set:');
    warnings.forEach(key => console.warn(`   - ${key}`));
  }

  // Validate JWT_SECRET strength
  // Weak secrets are a security risk
  if (process.env.JWT_SECRET.length < 32) {
    console.warn('⚠ JWT_SECRET should be at least 32 characters long for production use');
  }

  // Validate MONGO_URI format
  // Must be a valid MongoDB connection string
  const mongoUriPattern = /^mongodb(\+srv)?:\/\/.+/i;
  if (!mongoUriPattern.test(process.env.MONGO_URI)) {
    throw new Error('MONGO_URI must start with mongodb:// or mongodb+srv://');
  }

  // Enforce at least one API key for price fetching in production
  // Price fetching is a core feature, so we need at least one API key
  const hasAlphaVantage = !!process.env.ALPHA_VANTAGE_API_KEY;
  const hasFinnhub = !!process.env.FINNHUB_API_KEY;

  if (!hasAlphaVantage && !hasFinnhub) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('At least one stock price API key (ALPHA_VANTAGE or FINNHUB) is required in production');
    } else {
      console.warn('⚠ No stock price API keys configured. Price fetching will be limited.');
    }
  }

  console.log('✓ Environment variables validated');
  
  // Return validated configuration
  return {
    hasAlphaVantage,                    // Whether Alpha Vantage API key is configured
    hasFinnhub,                         // Whether Finnhub API key is configured
    corsOrigin: process.env.CORS_ORIGIN || '*',  // CORS origin (defaults to all)
    nodeEnv: process.env.NODE_ENV,      // Environment name
    port: parseInt(process.env.PORT || '5000', 10)  // Server port (defaults to 5000)
  };
}