import Joi from 'joi';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import User from "../models/user.js";

const registerSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).pattern(/[A-Z]/).pattern(/\d/).pattern(/\W/).required()
});
export async function registerUser (req, res){
    try {
        const { error, value } = registerSchema.validate(req.body);
        if (error){
            return res.status(400).json({error: error.message});
        }

        // Normalize email to lowercase and trim (consistent with login)
        const normalizedEmail = value.email.toLowerCase().trim();

        const exists = await User.findOne({ email: normalizedEmail });
        if (exists){
            return res.status(400).json({error: 'Registration Failed' });
        }

        const passwordHash = await bcrypt.hash(value.password, 12);
        try {
            const user = await User.create({email: normalizedEmail, passwordHash});
            return res.status(201).json({id: user.id, email: user.email});
        } catch (createError) {
            if (createError.code === 11000) {
                return res.status(400).json({error: 'Registration Failed' });
            } throw createError;
        }
    } catch (err) {
        console.error('Error registering user:', err);
        
        // Handle duplicate email error (race condition)
        if (err.code === 11000) {
            return res.status(400).json({error: 'Registration Failed' });
        }
        
        // Handle validation errors
        if (err.name === 'ValidationError') {
            return res.status(400).json({error: err.message});
        }
        
        res.status(500).json({error: 'Failed to register user'});
    }
}


const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});
export async function loginUser (req, res, next){
    const {error, value} = loginSchema.validate(req.body);
    if(error){
        return res.status(400).json({ error: error.message });
    }
    
    // Ensure JWT_SECRET is available
    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ error: 'Server configuration error' });
    }
    
    passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err) return res.status(500).json({ error: 'Authentication error' });
        if (!user) return res.status(401).json({ error: info?.message || 'Invalid credentials' });
        
        try {
            const token = jwt.sign(
                {sub: user._id.toString(), email: user.email }, 
                process.env.JWT_SECRET,
                { expiresIn: '1d'}
            );
            return res.json({
                token,
                user: {
                    id: user._id,
                    email: user.email
                }
            });
        } catch (jwtError) {
            console.error('JWT signing error:', jwtError);
            return res.status(500).json({ error: 'Authentication error' });
        }
    })(req, res, next);
}