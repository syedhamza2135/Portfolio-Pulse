/**
 * Authentication Routes
 * 
 * Defines public authentication endpoints:
 * - POST /api/auth/register - User registration
 * - POST /api/auth/login - User login (returns JWT tokens)
 * - POST /api/auth/refresh - Refresh access token
 * 
 * Note: These routes are public (no authentication required)
 * 
 * @module routes/authRoute
 * @requires express
 */

import { Router } from 'express';
import { loginUser, registerUser, refreshAccessToken } from '../controllers/authController.js';

const router = Router();

// User registration endpoint
// Creates new user account with email and password
router.post('/register', registerUser);

// User login endpoint
// Authenticates user and returns JWT access token + refresh token
router.post('/login', loginUser);

// Token refresh endpoint
// Exchanges refresh token for new access token
router.post('/refresh', refreshAccessToken);

export default router;