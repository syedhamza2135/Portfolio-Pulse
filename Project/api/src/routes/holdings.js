import { Router } from 'express';
import Holding from '../models/holdings.js';
import Portfolio from '../models/portfolio.js';
import { requireAuth } from '../middleware/auth';
import { createHoldingSchema, updateHoldingSchema } from '../validation/holding.js';