import { Request, Response, NextFunction } from 'express';
import * as messagesService from './messagesService';
import { messagesPopulate } from './messagesService';
import { dataNormalize } from '../../helpers/dataNormalize';
import { wsEvents } from '../../wsFlow';

export const createMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const savedMessage = await messagesService.createMessage(req.body);

    await savedMessage.populate(messagesPopulate);
    const event = wsEvents.messageSend;
    const data = dataNormalize(savedMessage);

    if (savedMessage.to.type === 'all') {
      res.io.emit(event, data);

      return;
    }

    res.io.to(savedMessage.to.id).emit(event, data);
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
