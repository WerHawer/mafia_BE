import { Request, Response, NextFunction } from 'express'
import * as messagesService from './messagesService'

export const createMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const message = await messagesService.createMessage(req.body)

    res.json(message)
  } catch (error) {
    next(error)
  }
}
