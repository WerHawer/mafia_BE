import { dataNormalize } from '../helpers/dataNormalize';
import { NextFunction, Response, Request } from 'express';

export const responseNormalizeMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.sendResponse = (data, status = 200) => {
    const responseData = dataNormalize(data);

    return res.status(status).json(responseData);
  };

  next();
};
