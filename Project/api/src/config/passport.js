import passportLocal from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import bcrypt from 'bcrypt';
import User from '../models/user.js';

const LocalStrategy = passportLocal.Strategy;

export default function setupPassport(passport) {
  // Local strategy for username/password login
  passport.use(
    new LocalStrategy(
      { usernameField: 'email', passwordField: 'password' },
      async (email, password, done) => {
        try {
          const user = await User.findOne({ email: email.toLowerCase().trim() });
          if (!user) return done(null, false, { message: 'Invalid credentials' });
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) return done(null, false, { message: 'Invalid credentials' });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  // JWT strategy for protected routes
  const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET
  };

  passport.use(
    new JwtStrategy(opts, async (payload, done) => {
      try {
        const id = payload.sub || payload.id || payload._id;
        if (!id) return done(null, false);
        const user = await User.findById(id).select('-passwordHash');
        if (user) return done(null, user);
        return done(null, false);
      } catch (err) {
        return done(err, false);
      }
    })
  );

  return passport;
}
