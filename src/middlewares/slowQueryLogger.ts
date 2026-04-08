import { Request, Response, NextFunction } from 'express';

const SLOW_QUERY_THRESHOLD_MS = 300;

export const slowQueryLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      console.warn(
        `[SLOW QUERY] ${req.method} ${req.originalUrl} - ${duration}ms`
      );
    }
  });

  next();
};

