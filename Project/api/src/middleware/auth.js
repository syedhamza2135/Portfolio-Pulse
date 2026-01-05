import passport from 'passport';

export function requireAuth(req, res, next) {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      console.error('Passport Auth Error:', err);
      return res.status(500).json({ 
        error: 'Internal server error during authentication' 
      });
    }

    if (!user) {
      const errorMessage = info?.name === 'TokenExpiredError' 
        ? 'Your session has expired. Please log in again.' 
        : 'Access denied. Valid token required.';
        
      return res.status(401).json({ error: errorMessage });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      preferences: user.preferences || {}
    };

    next();
  })(req, res, next);
}