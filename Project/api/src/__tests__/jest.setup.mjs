import mongoose from 'mongoose';
import 'dotenv/config';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-only-minimum-32-chars';

// Global setup - runs once before all test files
beforeAll(async () => {
  // Connect to test database
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to test database');
  }
});

// Clean up after each test
beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// Global teardown - runs once after all test files
afterAll(async () => {
  await mongoose.connection.close();
  console.log('✓ Closed test database connection');
});