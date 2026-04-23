import { NextFunction, Request, Response } from 'express';
import { createGamesShortData } from '../../helpers/createGamesShortData';
import { dataNormalize } from '../../helpers/dataNormalize';
import { idFormatValidation } from '../../helpers/idFormatValidation';
import { userSocketMap, wsEvents, scheduleEmptyGameDeactivation, cancelEmptyGameDeactivation, handleGMLeave } from '../../wsFlow';
import * as gamesService from './gamesService';
import { IGame } from './gamesTypes';

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
    const shortGames = dataNormalize(games.map(createGamesShortData));

    res.sendResponse(shortGames);
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

    res
      .sendResponse(game)
      .io.emit(wsEvents.gamesUpdate, createGamesShortData(game));
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

    const normalizedGame = dataNormalize<IGame>(game);

    if (!normalizedGame.gameFlow.voted) {
      normalizedGame.gameFlow.voted = {};
    }

    const io = res.sendResponse(normalizedGame).io;

    // Join newly killed players to the dead chat room
    const killedPlayers: string[] = normalizedGame.gameFlow?.killed || [];
    const deadRoom = `${id}_dead`;

    for (const killedUserId of killedPlayers) {
      const socketId = userSocketMap.get(killedUserId);
      if (socketId) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket && !targetSocket.rooms.has(deadRoom)) {
          targetSocket.join(deadRoom);
          console.log(
            `[DeadChat] User ${killedUserId} joined dead room ${deadRoom}`
          );
        }
      }
    }

    io.to(id).emit(wsEvents.gameUpdate, normalizedGame);
  } catch (error) {
    next(error);
  }
};

export const verifyGamePassword = async (
  req: Request<any, any, { password: string }>,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!idFormatValidation(id)) {
    return res.sendError({ message: 'Invalid Game ID format', status: 400 });
  }

  if (!password) {
    return res.sendError({ message: 'Password is required', status: 400 });
  }

  try {
    const isValid = await gamesService.verifyGamePassword(id, password);

    if (!isValid) {
      return res.sendError({ message: 'Invalid password', status: 401 });
    }

    res.sendResponse({ valid: true });
  } catch (error) {
    next(error);
  }
};

export const addUserToGame = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id, userId } = req.params;

  if (!idFormatValidation(id)) {
    console.error(`[addUserToGame Controller] Invalid Game ID format: ${id}`);
    return res.sendError({ message: 'Invalid Game ID format', status: 400 });
  }

  if (!idFormatValidation(userId)) {
    console.error(
      `[addUserToGame Controller] Invalid User ID format: ${userId}`
    );
    return res.sendError({ message: 'Invalid User ID format', status: 400 });
  }

  try {
    const game = await gamesService.addGamePlayers(id, userId);

    if (!game) {
      console.error(`[addUserToGame Controller] Game ${id} not found`);
      return res.sendError({ message: 'Game not found', status: 404 });
    }

    console.log(
      `[addUserToGame Controller] Successfully added user ${userId} to game ${id}`
    );

    const normalizedGame = dataNormalize(game);
    const io = res.sendResponse(game).io;

    io.to(id).emit(wsEvents.gameUpdate, normalizedGame);
    // Cancel empty-game deactivation timer if someone rejoined
    cancelEmptyGameDeactivation(id);
    // Broadcast to all clients so the home page game list stays in sync
    io.emit(wsEvents.roomConnection, {
      userId,
      roomId: id,
      game: dataNormalize(createGamesShortData(game)),
    });
    io.emit(wsEvents.gamesUpdate, dataNormalize(createGamesShortData(game)));
  } catch (error) {
    console.error(`[addUserToGame Controller] Error:`, error);
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

    const normalizedGame = dataNormalize(game);
    const io = res.sendResponse(normalizedGame).io;

    // Handle GM leaving via HTTP (voluntary leave button)
    const wasGM = (game as any).gm?.toString() === userId;
    const wasStarted: boolean = (game as any).gameFlow?.isStarted ?? false;
    if (wasGM && game.players.length > 0) {
      handleGMLeave(id, userId, [...game.players], wasStarted, io);
    }

    // If no players left: immediately restart so the game is joinable again,
    // then start the 1-minute countdown to full deactivation
    if (game.players.length === 0) {
      const restartedGame = await gamesService.restartGame(id);
      if (restartedGame) {
        game = restartedGame;
        io.emit(wsEvents.gamesUpdate, dataNormalize(createGamesShortData(restartedGame)));
      }
      scheduleEmptyGameDeactivation(id, io);
    }

    // Emit gameUpdate to everyone in the room including the leaving player,
    // so they also receive the updated player count while still on the game page.
    io.to(id).emit(wsEvents.gameUpdate, dataNormalize(game));
    // Broadcast roomLeave with the authoritative updated game data so the home
    // page game list reflects the correct player count immediately — this is
    // the definitive event since the cache is already updated at this point.
    io.emit(wsEvents.roomLeave, {
      userId,
      roomId: id,
      game: dataNormalize(createGamesShortData(game)),
    });
    io.emit(wsEvents.gamesUpdate, dataNormalize(createGamesShortData(game)));
  } catch (error) {
    next(error);
  }
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

    const normalizedGame = dataNormalize(game);

    res
      .status(200)
      .json(normalizedGame)
      .io.to(id)
      .emit(wsEvents.gameUpdate, normalizedGame);
  } catch (error) {
    next(error);
  }
};

export const restartGame = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  if (!idFormatValidation(id)) {
    return res.sendError({ message: 'Invalid Game ID format', status: 400 });
  }

  try {
    const game = await gamesService.restartGame(id);

    if (!game) {
      return res.sendError({ message: 'Game not found', status: 404 });
    }

    const io = res.sendResponse(dataNormalize(game)).io;

    // Remove all sockets from the dead chat room on restart
    const deadRoom = `${id}_dead`;
    const socketsInDeadRoom = await io.in(deadRoom).fetchSockets();

    for (const deadSocket of socketsInDeadRoom) {
      deadSocket.leave(deadRoom);
    }

    console.log(
      `[DeadChat] Cleared ${socketsInDeadRoom.length} sockets from ${deadRoom} on restart`
    );

    io.to(id).emit(wsEvents.gameUpdate, dataNormalize(game));
    // Broadcast to all clients so the home-page list shows the game as joinable again
    io.emit(wsEvents.gamesUpdate, createGamesShortData(game));
  } catch (error) {
    next(error);
  }
};

export const startGame = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  if (!idFormatValidation(id)) {
    return res.sendError({ message: 'Invalid ID format', status: 400 });
  }

  try {
    const game = await gamesService.startGame(id);

    if (!game) {
      return res.sendError({ message: 'Game not found', status: 404 });
    }

    const io = res.sendResponse(game).io;
    io.to(id).emit(wsEvents.gameUpdate, dataNormalize(game));
    // Broadcast to all clients so the home-page list marks game as "in progress"
    io.emit(wsEvents.gamesUpdate, createGamesShortData(game));
  } catch (error) {
    next(error);
  }
};

export const startDay = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  if (!idFormatValidation(id)) {
    return res.sendError({ message: 'Invalid ID format', status: 400 });
  }

  try {
    const game = await gamesService.startDay(id);

    if (!game) {
      return res.sendError({ message: 'Game not found', status: 404 });
    }

    res
      .sendResponse(game)
      .io.to(id)
      .emit(wsEvents.gameUpdate, dataNormalize(game));
  } catch (error) {
    next(error);
  }
};

export const startNight = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  if (!idFormatValidation(id)) {
    return res.sendError({ message: 'Invalid ID format', status: 400 });
  }

  try {
    const game = await gamesService.startNight(id);

    if (!game) {
      return res.sendError({ message: 'Game not found', status: 404 });
    }

    res
      .sendResponse(game)
      .io.to(id)
      .emit(wsEvents.gameUpdate, dataNormalize(game));
  } catch (error) {
    next(error);
  }
};

export const addUserToProposed = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;
  const { userId, proposerId } = req.body;

  if (!idFormatValidation(id)) {
    return res.sendError({ message: 'Invalid Game ID format', status: 400 });
  }

  if (!userId || !proposerId) {
    return res.sendError({ message: 'userId and proposerId are required', status: 400 });
  }

  if (!idFormatValidation(userId)) {
    return res.sendError({ message: 'Invalid User ID format', status: 400 });
  }

  try {
    const game = await gamesService.addUserToProposed(id, userId, proposerId);

    if (!game) {
      return res.sendError({ message: 'Game not found', status: 404 });
    }

    res.sendResponse(game).io.to(id).emit(wsEvents.addToProposed, { userId, proposerId });
  } catch (error) {
    next(error);
  }
};

export const addVote = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;
  const { targetUserId, voterId } = req.body;

  if (!idFormatValidation(id)) {
    return res.sendError({ message: 'Invalid Game ID format', status: 400 });
  }

  if (!targetUserId) {
    return res.sendError({ message: 'targetUserId is required', status: 400 });
  }

  if (!voterId) {
    return res.sendError({ message: 'voterId is required', status: 400 });
  }

  if (!idFormatValidation(targetUserId)) {
    return res.sendError({
      message: 'Invalid Target User ID format',
      status: 400,
    });
  }

  if (!idFormatValidation(voterId)) {
    return res.sendError({ message: 'Invalid Voter ID format', status: 400 });
  }

  try {
    const game = await gamesService.addVote(id, targetUserId, voterId);

    if (!game) {
      return res.sendError({ message: 'Game not found', status: 404 });
    }

    res
      .sendResponse(game)
      .io.to(id)
      .emit(wsEvents.vote, { targetUserId, voterId });
  } catch (error) {
    next(error);
  }
};

export const addShoot = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;
  const { targetUserId, shooterId, shot } = req.body;

  if (!idFormatValidation(id)) {
    return res.sendError({ message: 'Invalid Game ID format', status: 400 });
  }

  if (!targetUserId) {
    return res.sendError({ message: 'targetUserId is required', status: 400 });
  }

  if (!shooterId) {
    return res.sendError({ message: 'shooterId is required', status: 400 });
  }

  if (!idFormatValidation(targetUserId)) {
    return res.sendError({
      message: 'Invalid Target User ID format',
      status: 400,
    });
  }

  if (!idFormatValidation(shooterId)) {
    return res.sendError({ message: 'Invalid Shooter ID format', status: 400 });
  }

  try {
    const game = await gamesService.addShoot(id, targetUserId, shooterId, shot);

    if (!game) {
      return res.sendError({ message: 'Game not found', status: 404 });
    }

    res
      .sendResponse(game)
      .io.to(id)
      .emit(wsEvents.shoot, { targetUserId, shooterId, shot });
  } catch (error) {
    next(error);
  }
};
