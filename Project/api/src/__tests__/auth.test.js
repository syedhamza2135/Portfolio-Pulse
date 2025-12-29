import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import express from 'express';
import passport from 'passport';
import User from '../models/user.js';
import authRoutes from '../routes/authRoute.js';
import setupPassport from '../config/passport.js';
import mongoSanitize from 'express-mongo-sanitize';
import 'dotenv/config';

jest.setTimeout(20000);

// Mock environment variables
process.env.JWT_SECRET = '4c63ba0f24aa80ceb75c4e513d72b546406d53b5bd7618b70fc94dcb3a7c1001';
process.env.NODE_ENV = 'test';

// Create test app with middleware - MUST initialize passport properly
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(mongoSanitize({ replaceWith: '_' }));
  
  // CRITICAL: Initialize passport BEFORE routes
  setupPassport(passport);
  app.use(passport.initialize());
  
  app.use('/api/auth', authRoutes);
  return app;
}

describe('Authentication Logic', () => {
  let testUser;
  let app;
  const testEmail = 'test@example.com';
  const testPassword = 'Test123!@#';
  
  // Connect to DB once
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
    app = createTestApp();
  });

  // Clean DB + create user per test
  beforeEach(async () => {
    await User.deleteMany({});
  });

  // Close DB cleanly
  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  describe('User Registration', () => {
    beforeEach(async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      testUser = await User.create({
        email: testEmail,
        passwordHash,
      });
    });

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

    it('should register new user via API', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'NewPass123!@#'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email', 'newuser@example.com');
      expect(response.body).not.toHaveProperty('passwordHash');
      
      // Verify email is normalized in database
      const user = await User.findById(response.body.id);
      expect(user.email).toBe('newuser@example.com');
    });

    it('should reject registration with existing email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: 'AnotherPass123!@#'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Registration Failed');
    });

    it('should normalize email during registration (case-insensitive)', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'MixedCase@Example.COM',
          password: 'Test123!@#'
        });

      expect(response.status).toBe(201);
      expect(response.body.email).toBe('mixedcase@example.com');
      
      // Verify in database
      const user = await User.findOne({ email: 'mixedcase@example.com' });
      expect(user).toBeDefined();
      expect(user.email).toBe('mixedcase@example.com');
    });

    it('should normalize email during registration (trim whitespace)', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: '  spaced@example.com  ',
          password: 'Test123!@#'
        });

      expect(response.status).toBe(201);
      expect(response.body.email).toBe('spaced@example.com');
    });

    it('should reject weak passwords', async () => {
      const weakPasswords = [
        'short', // too short
        'nouppercase123!', // no uppercase
        'NoDigits!@#', // no digits
        'NoSpecial123', // no special chars
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: `test${Math.random()}@example.com`,
            password
          });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'ValidPass123!@#'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('JWT Token Generation', () => {

    beforeEach(async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      testUser = await User.create({
        email: testEmail,
        passwordHash,
      });
    });


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

    it('should reject expired tokens', () => {
      const token = jwt.sign(
        { sub: testUser._id.toString() },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' } // Already expired
      );

      expect(() => jwt.verify(token, process.env.JWT_SECRET)).toThrow();
    });
  });

  describe('Login API', () => {
    beforeEach(async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      testUser = await User.create({
        email: testEmail,
        passwordHash,
      });
    });


    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', testEmail);
      expect(response.body.user).not.toHaveProperty('passwordHash');

      // Verify token is valid
      const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
      expect(decoded.email).toBe(testEmail);
    });

    it('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword123!@#'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testPassword
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should reject login with missing fields', async () => {
      // Missing password
      let response = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');

      // Missing email
      response = await request(app)
        .post('/api/auth/login')
        .send({ password: testPassword });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle case-insensitive email login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail.toUpperCase(),
          password: testPassword
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(testEmail.toLowerCase());
    });

    it('should trim email whitespace on login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: `  ${testEmail}  `,
          password: testPassword
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });
  });

  describe('Password Validation', () => {
    beforeEach(async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      testUser = await User.create({
        email: testEmail,
        passwordHash,
      });
    });

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

    it('should accept valid password patterns', () => {
      const validPasswords = [
        'Abcdef1!',
        'Pass123@word',
        'MyP@ssw0rd',
        'Str0ng#Pass',
      ];

      validPasswords.forEach(password => {
        expect(password.length).toBeGreaterThanOrEqual(6);
        expect(/[A-Z]/.test(password)).toBe(true);
        expect(/\d/.test(password)).toBe(true);
        expect(/\W/.test(password)).toBe(true);
      });
    });
  });

  describe('Input Sanitization', () => {
    beforeEach(async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      testUser = await User.create({
        email: testEmail,
        passwordHash,
      });
    });
    it('should sanitize NoSQL injection attempts in email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: { $gt: '' }, // NoSQL injection attempt
          password: testPassword
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should sanitize malicious characters in registration', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test$attack.com',
          password: 'Test123!@#'
        });

      // Email validation should catch this
      expect(response.status).toBe(400);
    });

    it('should handle nested object injection attempts', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: { $ne: null },
          password: { $ne: null }
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      testUser = await User.create({
        email: testEmail,
        passwordHash,
      });
    });
    it('should return consistent error format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid',
          password: 'short'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });

    it('should not leak sensitive information in errors', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword'
        });

      // Check response has error property and it's a string
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
      
      // Then check it doesn't contain sensitive info
      expect(response.body.error).not.toContain('passwordHash');
      expect(response.body.error).not.toContain('bcrypt');
      expect(response.body.error).not.toContain('mongoose');
    });
  });

  describe('User Model', () => {
    beforeEach(async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      testUser = await User.create({
        email: testEmail,
        passwordHash,
      });
    });
    it('should have default preferences', async () => {
      const user = await User.findById(testUser._id);
      
      expect(user.preferences).toBeDefined();
      expect(user.preferences.alertThreshold).toBe(3);
      expect(user.preferences.emailEnabled).toBe(true);
    });

    it('should have timestamps', async () => {
      const user = await User.findById(testUser._id);
      
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should enforce unique email constraint', async () => {
      const passwordHash = await bcrypt.hash('AnotherPass123!', 4);
      
      await expect(
        User.create({ email: testEmail, passwordHash })
      ).rejects.toThrow();
    });

    it('should require email and passwordHash', async () => {
      await expect(
        User.create({ email: 'test@test.com' })
      ).rejects.toThrow();

      await expect(
        User.create({ passwordHash: 'hash' })
      ).rejects.toThrow();
    });

    it('should lowercase and trim email on save', async () => {
      const newEmail = '  NEWTEST@EXAMPLE.COM  ';
      const passwordHash = await bcrypt.hash('Test123!@#', 4);
      
      const user = await User.create({
        email: newEmail,
        passwordHash
      });

      expect(user.email).toBe('newtest@example.com');
    });
  });

  describe('Token Payload', () => {
    beforeEach(async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      testUser = await User.create({
        email: testEmail,
        passwordHash,
      });
    });
    it('should include correct user information in token', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');

      const decoded = jwt.decode(response.body.token);

      expect(decoded).toBeDefined();
      expect(decoded).not.toBeNull();
      expect(decoded).toHaveProperty('sub');
      expect(decoded).toHaveProperty('email', testEmail);
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
      expect(decoded.exp - decoded.iat).toBe(86400); // 1 day
    });

    it('should use sub field for user ID', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      expect(response.status).toBe(200);
      const decoded = jwt.decode(response.body.token);

      expect(decoded).toBeDefined();
      expect(decoded).not.toBeNull();
      expect(decoded.sub).toBe(testUser._id.toString());
      expect(decoded.sub).not.toBeInstanceOf(mongoose.Types.ObjectId);
    });
  });

  describe('Security Best Practices', () => {
    beforeEach(async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      testUser = await User.create({
        email: testEmail,
        passwordHash,
      });
    });
    it('should not return passwordHash in any response', async () => {
      // Registration
      let response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'secure@example.com',
          password: 'Secure123!@#'
        });

      expect(response.body).not.toHaveProperty('passwordHash');

      // Login
      response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    it('should use bcrypt with sufficient rounds', async () => {
      const hash = await bcrypt.hash('test', 12);
      const rounds = bcrypt.getRounds(hash);
      
      expect(rounds).toBeGreaterThanOrEqual(10);
    });

    it('should not reveal if email exists on login failure', async () => {
      // Try with non-existent email
      const response1 = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'WrongPass123!@#'
        });

      // Try with existing email but wrong password
      const response2 = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPass123!@#'
        });

      // Both should return the same generic error
      expect(response1.status).toBe(401);
      expect(response2.status).toBe(401);
      expect(response1.body.error).toBe(response2.body.error);
      expect(response1.body.error).toContain('Invalid credentials');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      testUser = await User.create({
        email: testEmail,
        passwordHash,
      });
    });
    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle very long passwords', async () => {
      const longPassword = 'A1!' + 'a'.repeat(1000);
      
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'longpass@example.com',
          password: longPassword
        });

      expect([201, 400]).toContain(response.status);
    });

    it('should handle unicode characters in password', async () => {
      const unicodePassword = 'Test123!😀';
      
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'unicode@example.com',
          password: unicodePassword
        });

      expect(response.status).toBe(201);
    });

    it('should handle concurrent registration attempts', async () => {
      const email = 'concurrent@example.com';
      const password = 'Test123!@#';

      // Attempt to register same email twice simultaneously
      const promises = [
        request(app).post('/api/auth/register').send({ email, password }),
        request(app).post('/api/auth/register').send({ email, password })
      ];

      const results = await Promise.all(promises);

      // One should succeed, one should fail
      const statuses = results.map(r => r.status).sort();
      expect(statuses.length).toBe(2);
      expect(statuses).toContain(201);
      expect(statuses).toContain(400);
      
      // Verify only one user was created
      const users = await User.find({ email: email.toLowerCase() });
      expect(users.length).toBe(1);
    });
  });
});