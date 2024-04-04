import { Request, Response, NextFunction } from 'express';
import * as messagesService from './messagesService';

export const createMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const message = await messagesService.createMessage(req.body);

    res.sendResponse(message);
  } catch (error) {
    next(error);
  }
};

export const getAllMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const messages = await messagesService.getAllPublicMessages();

    res.sendResponse(messages);
  } catch (error) {
    next(error);
  }
};

export const getPrivateMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id, sender } = req.params;

  try {
    const messages = await messagesService.getPrivateMessages(id, sender);

    res.sendResponse(messages);
  } catch (error) {
    next(error);
  }
};

export const getRoomMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  try {
    const messages = await messagesService.getRoomMessages(id);

    res.sendResponse(messages);
  } catch (error) {
    next(error);
  }
};
