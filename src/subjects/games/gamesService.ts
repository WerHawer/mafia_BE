import { Games } from './gamesSchema';
import { IGame } from './gamesTypes';
import { gameCache } from '../../helpers/cache';

// export const gamePopulateOption = [
//   Populate.Players,
//   Populate.GM,
//   Populate.Owner,
// ];
//
// const gamesOptions = {
//   populate: gamePopulateOption,
// };

const initialGameFlow = {
  speaker: '',
  speakTime: 60,
  votesTime: 15,
  isStarted: false,
  isFinished: false,
  isNight: false,
  isVote: false,
  isReVote: false,
  isExtraSpeech: false,
  day: 0,
  proposed: [],
  voted: {},
  shoot: {},
  killed: [],
  wakeUp: [],
};

// Base reset state — does NOT include creatingTime (set only at game creation)
const initialGame = {
  isActive: true,
  mafia: [],
  citizens: [],
  sheriff: '',
  doctor: '',
  maniac: '',
  prostitute: '',
  startTime: null,
  finishTime: null,
  gameFlow: initialGameFlow,
};

const resetDayNightFlow = {
  'gameFlow.speaker': '',
  'gameFlow.proposed': [],
  'gameFlow.shoot': {},
  'gameFlow.voted': {},
  'gameFlow.isVote': false,
  'gameFlow.isReVote': false,
  'gameFlow.isExtraSpeech': false,
  'gameFlow.wakeUp': '',
  'gameFlow.sheriffCheck': '',
  'gameFlow.donCheck': '',
};

// Список ігор не кешуємо — дані мають бути завжди актуальними
export const getGames = async () => Games.find({}, undefined, { limit: 100 });

export const getActiveGames = async () =>
  Games.find({ isActive: true }, undefined, { limit: 100 });

export const getGame = async (id: string) => {
  const cached = gameCache.get(id);
  if (cached) {
    return cached;
  }

  const game = await Games.findById(id);
  if (game) {
    gameCache.set(id, game);
  }

  return game;
};

export const createGame = async (game: IGame) =>
  Games.create({ ...game, creatingTime: Date.now() });

export const updateGame = async (id: string, game: Partial<IGame>) => {
  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    { $set: game },
    { new: true, uesFindAndModify: false }
  );

  if (updatedGame) {
    gameCache.set(id, updatedGame);
  }

  return updatedGame;
};

export const verifyGamePassword = async (
  id: string,
  password: string
): Promise<boolean> => {
  const game = await Games.findById(id);

  if (!game) {
    throw new Error(`Game with id ${id} not found`);
  }

  if (!game.isPrivate) {
    return true; // Public games don't need password
  }

  return game.password === password;
};

export const addGamePlayers = async (id: string, playerId: string) => {
  const game = await Games.findById(id);

  if (!game) {
    console.error(`[addGamePlayers] Game with id ${id} not found`);
    throw new Error(`Game with id ${id} not found`);
  }

  console.log(
    `[addGamePlayers] Current players:`,
    `(count: ${game.players.length})`
  );

  if (game.players.includes(playerId)) {
    return game;
  }

  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    { $addToSet: { players: playerId } },
    { new: true }
  );

  if (updatedGame) {
    gameCache.set(id, updatedGame);
  }

  return updatedGame;
};

export const removeGamePlayers = async (id: string, playerId: string) => {
  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    { $pull: { players: playerId } },
    { new: true }
  );

  if (updatedGame) {
    gameCache.set(id, updatedGame);
    console.log(
      `[removeGamePlayers] Successfully removed player ${playerId}`,
      `(left: ${updatedGame.players.length})`
    );
  } else {
    console.error(
      `[removeGamePlayers] Failed to remove player from game ${id}`
    );
  }

  return updatedGame;
};

export const addGameRoles = async (id: string, roles: Partial<IGame>) => {
  const cachedGame = gameCache.get(id);

  if (cachedGame) {
    // updateOne is faster — sends only { acknowledged: true } back instead of the full document
    await Games.updateOne({ _id: id }, { $set: roles });

    const cachedObject = cachedGame.toObject ? cachedGame.toObject() : cachedGame;
    const updatedGame = { ...cachedObject, ...roles };
    gameCache.set(id, updatedGame);

    return updatedGame;
  }

  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    { $set: roles },
    { new: true, uesFindAndModify: false }
  );

  if (updatedGame) {
    gameCache.set(id, updatedGame);
  }

  return updatedGame;
};

// creatingTime is intentionally excluded — it must never change after creation
export const restartGame = async (id: string) => {
  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    { $set: initialGame },
    { new: true, uesFindAndModify: false }
  );

  if (updatedGame) {
    gameCache.set(id, updatedGame);
  }

  return updatedGame;
};

export const startGame = async (id: string) => {
  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        isActive: true,
        startTime: new Date(),
        'gameFlow.isStarted': true,
        'gameFlow.day': 1,
      },
    },
    { new: true, uesFindAndModify: false }
  );

  if (updatedGame) {
    gameCache.set(id, updatedGame);
  }

  return updatedGame;
};

export const startDay = async (id: string) => {
  const game = await Games.findById(id);
  const block = game?.gameFlow.prostituteBlock || '';
  const save = game?.gameFlow.doctorSave || '';

  const newProstituteBlock = block === save && block !== '' ? '' : block;

  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        'gameFlow.isNight': false,
        'gameFlow.prostituteBlock': newProstituteBlock,
        ...resetDayNightFlow,
      },
      $inc: {
        'gameFlow.day': 1,
      },
    },
    { new: true, uesFindAndModify: false }
  );

  if (updatedGame) {
    gameCache.set(id, updatedGame);
  }

  return updatedGame;
};

export const startNight = async (id: string) => {
  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        'gameFlow.isNight': true,
        'gameFlow.prostituteBlock': '',
        'gameFlow.doctorSave': '',
        ...resetDayNightFlow,
      },
    },
    { new: true, uesFindAndModify: false }
  );

  if (updatedGame) {
    gameCache.set(id, updatedGame);
  }

  return updatedGame;
};

export const addUserToProposed = async (id: string, userId: string) => {
  const game = await Games.findById(id);

  if (!game) {
    console.error(`[addUserToProposed] Game with id ${id} not found`);
    throw new Error(`Game with id ${id} not found`);
  }

  console.log(
    `[addUserToProposed] Current proposed:`,
    game.gameFlow.proposed,
    `(count: ${game.gameFlow.proposed.length})`
  );

  if (game.gameFlow.proposed.includes(userId)) {
    console.log(`[addUserToProposed] User ${userId} already in proposed list`);
    return game;
  }

  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    { $addToSet: { 'gameFlow.proposed': userId } },
    { new: true }
  );

  if (updatedGame) {
    gameCache.set(id, updatedGame);
    console.log(
      `[addUserToProposed] Successfully added user ${userId}`,
      `(total: ${updatedGame.gameFlow.proposed.length})`
    );
  }

  return updatedGame;
};

export const addVote = async (
  id: string,
  targetUserId: string,
  voterId: string
) => {
  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    { $addToSet: { [`gameFlow.voted.${targetUserId}`]: voterId } },
    { new: true }
  );

  if (updatedGame) {
    gameCache.set(id, updatedGame);
  }

  return updatedGame;
};

export const addShoot = async (
  id: string,
  targetUserId: string,
  shooterId: string,
  shot?: { x: number; y: number }
) => {
  const defaultShot = { x: 50, y: 50 };

  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    {
      $push: {
        [`gameFlow.shoot.${targetUserId}.shooters`]: shooterId,
        [`gameFlow.shoot.${targetUserId}.shots`]: shot ?? defaultShot,
      },
    },
    { new: true }
  );

  if (updatedGame) {
    gameCache.set(id, updatedGame);
  }

  return updatedGame;
};
