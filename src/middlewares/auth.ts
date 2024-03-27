import passport from 'passport';
import passportJWT from 'passport-jwt';
import { getSecret } from '../helpers/getSecret';
import { Users } from '../subjects/users/usersSchema';
import { NextFunction, Request, Response } from 'express';

const secret = getSecret();

const ExtractJWT = passportJWT.ExtractJwt;
const Strategy = passportJWT.Strategy;

const params = {
  secretOrKey: secret,
  jwtFromRequest: ExtractJWT.fromAuthHeaderAsBearerToken(),
};

passport.use(
  new Strategy(params, function (payload, done) {
    Users.findById(payload.id)
      .then((user) => {
        if (!user) {
          return done(new Error('User not found'));
        }

        return done(null, user);
      })
      .catch((err) => done(err));
  })
);

export const auth = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (!user || err) {
      return res.sendError({ message: 'Unauthorized', status: 401 });
    }

    req.user = user;
    next();
  })(req, res, next);
};
