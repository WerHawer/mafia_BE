import * as gamesService from './gamesService';
import { NextFunction, Response, Request } from 'express';
import { idFormatValidation } from '../../helpers/idFormatValidation';
import { wsEvents } from '../../wsFlow';
import { dataNormalize } from '../../helpers/dataNormalize';

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

    if (!game) {
      return res.sendError({ message: 'Game not created', status: 400 });
    }

    res.sendResponse(game).io.emit(wsEvents.gameUpdate, dataNormalize(game));
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

    res.sendResponse(game).io.emit(wsEvents.gameUpdate, dataNormalize(game));
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
    return res.sendError({ message: 'Invalid Game ID format', status: 400 });
  }

  if (!idFormatValidation(userId)) {
    return res.sendError({ message: 'Invalid User ID format', status: 400 });
  }

  try {
    const game = await gamesService.addGamePlayers(id, userId);

    if (!game) {
      return res.sendError({ message: 'Game not found', status: 404 });
    }

    res.sendResponse(game).io.emit(wsEvents.gameUpdate, dataNormalize(game));
  } catch (error) {
    next(error);
  }
};

export const removeUserFromGame = async (
  req: Request<any, any, { userId: string }>,
  res: Response,
  next: NextFunction
) => {
  const { id, userId } = req.params;

  if (!idFormatValidation(id)) {
    return res.sendError({ message: 'Invalid Game ID format', status: 400 });
  }

  if (!idFormatValidation(userId)) {
    return res.sendError({ message: 'Invalid User ID format', status: 400 });
  }

  try {
    let game = await gamesService.removeGamePlayers(id, userId);

    if (!game) {
      return res.sendError({ message: 'Game not found', status: 404 });
    }

    if (game.players.length === 0) {
      game = await gamesService.updateGame(id, { isActive: false });
    }

    res
      .sendResponse(game)
      .io.to(id)
      .emit(wsEvents.gameUpdate, dataNormalize(game));
  } catch (error) {
    next(error);
  }
};

export const removeUserFromGameWithSocket = async (
  gameId: string,
  userId: string
) => {
  let game = await gamesService.removeGamePlayers(gameId, userId);

  if (userId === game.gm && game.players.length > 0) {
    game = await gamesService.updateGame(gameId, { gm: game.players[0] });
  }

  // if (game.players.length === 0) {
  //   game = await gamesService.updateGame(gameId, { isActive: false });
  // }

  return game;
};

export const addRolesToGame = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const roles = req.body;

  if (!roles) {
    return res.sendError({ message: 'No roles provided', status: 400 });
  }

  const { id } = req.params;

  if (!idFormatValidation(id)) {
    return res.sendError({ message: 'Invalid Game ID format', status: 400 });
  }

  try {
    const game = await gamesService.addGameRoles(id, roles);

    if (!game) {
      return res.sendError({ message: 'Game not found', status: 404 });
    }

    res.sendResponse(game).io.emit(wsEvents.gameUpdate, dataNormalize(game));
  } catch (error) {
    next(error);
  }
};
