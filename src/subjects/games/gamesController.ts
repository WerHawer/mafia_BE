import * as gamesService from './gamesService';
import { NextFunction, Response, Request } from 'express';
import { idFormatValidation } from '../../helpers/idFormatValidation';
import { wsEvents } from '../../wsFlow';

export const getGames = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const isActive = req.query.active === 'true';

  const requestHandler = isActive
    ? gamesService.getActiveGames
    : gamesService.getGames;

  try {
    const games = await requestHandler();

    res.sendResponse(games);
  } catch (error) {
    next(error);
  }
};

export const getGame = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  if (!idFormatValidation(id)) {
    return res.status(400).send('Invalid ID format');
  }

  try {
    const game = await gamesService.getGame(id);

    if (!game) {
      return res.status(404).send(`Game with id: ${id} not found`);
    }

    res.sendResponse(game);
  } catch (error) {
    next(error);
  }
};

export const createGame = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const game = await gamesService.createGame(req.body);

    res.sendResponse(game).io.emit(wsEvents.gameCreated);
  } catch (error) {
    next(error);
  }
};

export const updateGame = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  if (!idFormatValidation(id)) {
    return res.status(400).send('Invalid ID format');
  }

  try {
    const game = await gamesService.updateGame(id, req.body);

    if (!game) {
      return res.status(404).send(`Game with id: ${id} not found`);
    }

    res.sendResponse(game);
  } catch (error) {
    next(error);
  }
};

export const addUserToGame = async (
  req: Request<any, any, { userId: string }>,
  res: Response,
  next: NextFunction
) => {
  const { id, userId } = req.params;

  if (!idFormatValidation(id)) {
    return res.status(400).send('Invalid Game ID format');
  }

  if (!idFormatValidation(userId)) {
    return res.status(400).send('Invalid User ID format');
  }

  try {
    const game = await gamesService.getGame(id);

    if (!game) {
      return res.status(404).send(`Game with id: ${id} not found`);
    }

    game.players ? game.players.push(userId) : (game.players = [userId]);

    await game.save();

    res.sendResponse(game);
  } catch (error) {
    next(error);
  }
};
