import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import cors from 'cors';
import passport from 'passport';
import setupPassport from './config/passport.js';
import authRoutes from './routes/authRoute.js';
import meRoutes from './routes/me.js';
import portfolioRoutes from './routes/portfolioRoute.js';
import holdingRoutes from './routes/holdingsRoute.js';

dotenv.config();

const app = express();

setupPassport(passport);

app.use(express.json());
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(passport.initialize());

app.use('/api/auth', authRoutes);
app.use('/api', meRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/holdings', holdingRoutes);

app.get('/health', (req, res) => res.json ({ok: true}));

async function start() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        throw new Error('MONGO_URI is not set');
    }

    await mongoose.connect(mongoUri);

    const port = Number(process.env.PORT) || 5000;
    app.listen(port, () => {
        console.log(`API on: ${port}`);
    });
}

start().catch((e) => {
    console.error(e);
    process.exit(1);
})