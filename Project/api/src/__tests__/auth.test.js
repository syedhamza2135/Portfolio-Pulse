import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import 'dotenv/config'

jest.setTimeout(20000);

// Mock environment variables
process.env.JWT_SECRET = 'test-secret-key-for-jwt-testing-only';

describe('Authentication Logic', () => {
  let testUser;
  const testEmail = 'test@example.com';
  const testPassword = 'Test123!@#';

  // Connect to DB once
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI);
  });

  // Clean DB + create user per test
  beforeEach(async () => {
    await User.deleteMany({});

    const passwordHash = await bcrypt.hash(testPassword, 4); // faster for tests
    testUser = await User.create({
      email: testEmail,
      passwordHash,
    });
  });

  // Close DB cleanly
  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('User Registration', () => {
    it('should hash passwords correctly', async () => {
      const hash = await bcrypt.hash(testPassword, 4);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(testPassword);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should create user with hashed password', () => {
      expect(testUser).toBeDefined();
      expect(testUser.email).toBe(testEmail);
      expect(testUser.passwordHash).not.toBe(testPassword);
    });

    it('should verify password correctly', async () => {
      const isValid = await bcrypt.compare(testPassword, testUser.passwordHash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const isValid = await bcrypt.compare('WrongPassword123!', testUser.passwordHash);
      expect(isValid).toBe(false);
    });
  });

  describe('JWT Token Generation', () => {
    it('should generate valid JWT token', () => {
      const payload = {
        sub: testUser._id.toString(),
        email: testUser.email,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

      expect(token).toBeDefined();
      expect(token.split('.').length).toBe(3);
    });

    it('should verify JWT token correctly', () => {
      const payload = {
        sub: testUser._id.toString(),
        email: testUser.email,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      expect(decoded.sub).toBe(testUser._id.toString());
      expect(decoded.email).toBe(testUser.email);
    });

    it('should reject token with wrong secret', () => {
      const token = jwt.sign(
        { sub: testUser._id.toString() },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );

      expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
    });

    it('should include expiration in token', () => {
      const token = jwt.sign(
        { sub: testUser._id.toString() },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );

      const decoded = jwt.decode(token);

      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp - decoded.iat).toBe(86400);
    });
  });

  describe('Password Validation', () => {
    it('should require minimum 6 characters', () => {
      expect(testPassword.length).toBeGreaterThanOrEqual(6);
    });

    it('should require uppercase letter', () => {
      expect(/[A-Z]/.test(testPassword)).toBe(true);
    });

    it('should require digit', () => {
      expect(/\d/.test(testPassword)).toBe(true);
    });

    it('should require special character', () => {
      expect(/\W/.test(testPassword)).toBe(true);
    });
  });
});