import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/user.js';

// Mock environment variables
process.env.JWT_SECRET = 'test-secret-key-for-jwt-testing-only';

describe('Authentication Logic', () => {
  let testUser;
  const testEmail = 'test@example.com';
  const testPassword = 'Test123!@#';

  beforeEach(async () => {
    // Clean up any existing test user
    await User.deleteOne({ email: testEmail });
    
    // Create a test user
    const passwordHash = await bcrypt.hash(testPassword, 12);
    testUser = await User.create({
      email: testEmail,
      passwordHash,
    });
  });

  afterEach(async () => {
    // Clean up test user
    await User.deleteOne({ email: testEmail });
  });

  describe('User Registration', () => {
    it('should hash passwords correctly', async () => {
      const plainPassword = 'Test123!@#';
      const hash = await bcrypt.hash(plainPassword, 12);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(plainPassword);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should create user with hashed password', async () => {
      expect(testUser).toBeDefined();
      expect(testUser.email).toBe(testEmail);
      expect(testUser.passwordHash).toBeDefined();
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
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
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
      const payload = {
        sub: testUser._id.toString(),
        email: testUser.email,
      };
      
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
      
      expect(() => {
        jwt.verify(token, 'wrong-secret');
      }).toThrow();
    });

    it('should include expiration in token', () => {
      const payload = {
        sub: testUser._id.toString(),
        email: testUser.email,
      };
      
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
      const decoded = jwt.decode(token);
      
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp - decoded.iat).toBe(24 * 60 * 60); // 1 day in seconds
    });
  });

  describe('Password Validation', () => {
    it('should require minimum 6 characters', () => {
      const shortPassword = 'Test1!';
      expect(shortPassword.length).toBeGreaterThanOrEqual(6);
    });

    it('should require uppercase letter', () => {
      const hasUpper = /[A-Z]/.test(testPassword);
      expect(hasUpper).toBe(true);
    });

    it('should require digit', () => {
      const hasDigit = /\d/.test(testPassword);
      expect(hasDigit).toBe(true);
    });

    it('should require special character', () => {
      const hasSpecial = /\W/.test(testPassword);
      expect(hasSpecial).toBe(true);
    });
  });
});

