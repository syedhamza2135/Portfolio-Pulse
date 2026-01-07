export function validateEnvironment() {
  const required = [
    'MONGO_URI',
    'JWT_SECRET',
    'NODE_ENV'
  ];

  const optional = [
    'PORT',
    'CORS_ORIGIN',
    'ALPHA_VANTAGE_API_KEY',
    'FINNHUB_API_KEY'
  ];

  const missing = [];
  const warnings = [];

  // Check required variables
  required.forEach(key => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });

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

  if (warnings.length > 0) {
    console.warn('⚠ Optional environment variables not set:');
    warnings.forEach(key => console.warn(`   - ${key}`));
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET.length < 32) {
    console.warn('⚠ JWT_SECRET should be at least 32 characters long');
  }

  // Validate MONGO_URI format
  if (!process.env.MONGO_URI.startsWith('mongodb://') && 
      !process.env.MONGO_URI.startsWith('mongodb+srv://')) {
    throw new Error('MONGO_URI must start with mongodb:// or mongodb+srv://');
  }

  // FIX: Enforce at least one API key for price fetching
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
  return {
    hasAlphaVantage,
    hasFinnhub,
    corsOrigin: process.env.CORS_ORIGIN || '*',
    nodeEnv: process.env.NODE_ENV,
    port: parseInt(process.env.PORT || '5000', 10)
  };
}