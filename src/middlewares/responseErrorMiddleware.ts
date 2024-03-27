import { NextFunction, Request, Response } from 'express';
import { dataNormalize } from '../helpers/dataNormalize';

export const responseErrorMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.sendError = ({ message, status = 400, field }) => {
    return res.status(status).json({ message, type: 'error', status, field });
  };

  next();
};
