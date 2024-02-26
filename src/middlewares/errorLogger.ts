import { Response, Request, NextFunction } from 'express'

export const errorLogger = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(err)
  next(err)
}
