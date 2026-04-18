import { Games } from './gamesSchema';
import { IGame } from './gamesTypes';
import { gameCache } from '../../helpers/cache';

/**
 * Converts a Mongoose Document (or already-plain object) into a normalized plain JS object:
 * - Ensures `id` (string) is always present alongside `_id`
 * - Converts `players` array entries from ObjectId to string to allow reliable includes/indexOf comparisons
 *
 * This is critical because `toObject()` keeps ObjectIds as-is, which breaks string comparisons.
 */
const toPlainGameObj = (game: any): any => {
  const obj: Record<string, any> = game.toObject
    ? game.toObject()
    : { ...game };

  if (!obj.id && obj._id) {
    obj.id = obj._id.toString();
  }

  if (Array.isArray(obj.players)) {
    obj.players = obj.players.map((p: any) =>
      p != null && typeof p.toString === 'function' ? p.toString() : p
    );
  }

  return obj;
};

// --- STATEFUL SERVER (Write-Behind Aggegator) ---
const dirtyGames = new Set<string>();

export const markGameDirty = (id: string | undefined | null) => {
  if (id) dirtyGames.add(id.toString());
};

setInterval(async () => {
  if (dirtyGames.size === 0) return;

  const gamesToSave = Array.from(dirtyGames);
  dirtyGames.clear();

  const startDb = Date.now();
  try {
    const promises = gamesToSave.map(async (id) => {
      const gameObj = gameCache.get(id) as any;
      if (!gameObj) return;

      // Клонуємо об'єкт щоб не мутувати його в пам'яті під час видалення _id
      const copy = { ...gameObj };
      delete copy._id;

      return Games.updateOne({ _id: id }, { $set: copy }).exec();
    });

    await Promise.allSettled(promises);
    console.log(
      `[DB Write-Behind Flush] Aggregated and saved ${gamesToSave.length} games to MongoDB in ${Date.now() - startDb}ms`
    );
  } catch (error) {
    console.error('[DB Write-Behind Flush] Error:', error);
  }
}, 15000); // Фіксація в базу кожні 15 секунд

export const forceSaveGame = (id: string) => {
  dirtyGames.delete(id.toString()); // Видаляємо з черги агрегатора
  const gameObj = gameCache.get(id) as any;
  if (!gameObj) return;

  const copy = { ...gameObj };
  delete copy._id;

  const startDb = Date.now();
  Games.updateOne({ _id: id }, { $set: copy })
    .exec()
    .then(() =>
      console.log(
        `[DB Force Save] Game ${id} saved instantly in ${Date.now() - startDb}ms`
      )
    )
    .catch((e) => console.error('[DB Force Save Error]:', e));
};
// ------------------------------------------------

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
  sleeping: [],
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
  const idStr = typeof id === 'string' ? id : String(id);

  if (!idStr || idStr === '[object Object]') {
    console.error('[getGame] Invalid game id received:', id);
    return null;
  }

  const cached = gameCache.get(idStr);
  if (cached) {
    return cached;
  }

  const game = await Games.findById(idStr);
  if (game) {
    const plainGame = toPlainGameObj(game);
    gameCache.set(idStr, plainGame);
    return plainGame;
  }

  return null;
};

export const createGame = async (game: IGame) =>
  Games.create({ ...game, creatingTime: Date.now() });

export const updateGame = async (id: string, gameUpdates: Partial<IGame>) => {
  const game = await getGame(id);
  if (!game) return null;

  const gameObj = toPlainGameObj(game);

  // Оновлюємо кеш (підтримує dot-notation, напр. 'gameFlow.speaker')
  for (const [key, value] of Object.entries(gameUpdates)) {
    const parts = key.split('.');
    let current = gameObj as any;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  gameCache.set(id, gameObj);
  markGameDirty(id); // Записали зміну, база оновить сама через 5 секунд

  return gameObj;
};

export const verifyGamePassword = async (
  id: string,
  password: string
): Promise<boolean> => {
  const game = await getGame(id);

  if (!game) {
    throw new Error(`Game with id ${id} not found`);
  }

  if (!game.isPrivate) {
    return true; // Public games don't need password
  }

  return game.password === password;
};

export const addGamePlayers = async (id: string, playerId: string) => {
  const game = await getGame(id);

  if (!game) {
    console.error(`[addGamePlayers] Game with id ${id} not found`);
    throw new Error(`Game with id ${id} not found`);
  }

  const gameObj = toPlainGameObj(game);

  if (!gameObj.players.includes(playerId)) {
    gameObj.players.push(playerId);
    gameCache.set(id, gameObj);
    // Player join is a key event — force immediate DB sync instead of waiting for the aggregator
    forceSaveGame(id);
  }

  console.log(
    `[addGamePlayers] Current players: (count: ${gameObj.players.length})`
  );

  return gameObj;
};

export const removeGamePlayers = async (id: string, playerId: string) => {
  const game = await getGame(id);
  if (!game) return null;

  const gameObj = toPlainGameObj(game);
  const index = gameObj.players.indexOf(playerId);

  if (index > -1) {
    gameObj.players.splice(index, 1);
    gameCache.set(id, gameObj);
    // Player leave is a key event — force immediate DB sync instead of waiting for the aggregator
    forceSaveGame(id);
    console.log(
      `[removeGamePlayers] Successfully removed player ${playerId} (left: ${gameObj.players.length})`
    );
  } else {
    console.error(
      `[removeGamePlayers] Failed to find player ${playerId} in game ${id}`
    );
  }

  return gameObj;
};

export const addGameRoles = async (id: string, roles: Partial<IGame>) => {
  const game = await getGame(id);
  if (!game) return null;

  const gameObj = toPlainGameObj(game);
  Object.assign(gameObj, roles);

  gameCache.set(id, gameObj);
  markGameDirty(id);

  return gameObj;
};

// creatingTime is intentionally excluded — it must never change after creation
export const restartGame = async (id: string) => {
  const game = await getGame(id);
  if (!game) return null;

  const gameObj = toPlainGameObj(game);

  Object.assign(gameObj, initialGame);
  gameObj.gameFlow = JSON.parse(JSON.stringify(initialGameFlow));

  gameCache.set(id, gameObj);
  forceSaveGame(id);

  return gameObj;
};

export const startGame = async (id: string) => {
  const game = await getGame(id);
  if (!game) return null;

  const gameObj = toPlainGameObj(game);

  gameObj.isActive = true;
  gameObj.startTime = Date.now();
  gameObj.gameFlow.isStarted = true;
  gameObj.gameFlow.day = 1;

  gameCache.set(id, gameObj);
  forceSaveGame(id);

  return gameObj;
};

export const startDay = async (id: string) => {
  const game = await getGame(id);
  if (!game) return null;

  const gameObj = toPlainGameObj(game);
  const block = gameObj.gameFlow?.prostituteBlock || '';
  const save = gameObj.gameFlow?.doctorSave || '';

  const newProstituteBlock = block === save && block !== '' ? '' : block;

  // Оновлюємо in-memory
  gameObj.gameFlow.isNight = false;
  gameObj.gameFlow.prostituteBlock = newProstituteBlock;
  gameObj.gameFlow.day = (gameObj.gameFlow.day || 0) + 1;

  // Manual resetDayNightFlow mapping
  gameObj.gameFlow.speaker = '';
  gameObj.gameFlow.proposed = [];
  gameObj.gameFlow.shoot = {};
  gameObj.gameFlow.voted = {};
  gameObj.gameFlow.isVote = false;
  gameObj.gameFlow.isReVote = false;
  gameObj.gameFlow.isExtraSpeech = false;
  gameObj.gameFlow.wakeUp = '';
  gameObj.gameFlow.sheriffCheck = '';
  gameObj.gameFlow.donCheck = '';
  gameObj.gameFlow.sleeping = [];

  gameCache.set(id, gameObj);
  forceSaveGame(id);

  return gameObj;
};

export const startNight = async (id: string) => {
  const game = await getGame(id);
  if (!game) return null;

  const gameObj = toPlainGameObj(game);

  gameObj.gameFlow.isNight = true;
  gameObj.gameFlow.prostituteBlock = '';
  gameObj.gameFlow.doctorSave = '';

  // Manual resetDayNightFlow mapping
  gameObj.gameFlow.speaker = '';
  gameObj.gameFlow.proposed = [];
  gameObj.gameFlow.shoot = {};
  gameObj.gameFlow.voted = {};
  gameObj.gameFlow.isVote = false;
  gameObj.gameFlow.isReVote = false;
  gameObj.gameFlow.isExtraSpeech = false;
  gameObj.gameFlow.wakeUp = '';
  gameObj.gameFlow.sheriffCheck = '';
  gameObj.gameFlow.donCheck = '';
  gameObj.gameFlow.sleeping = [];

  gameCache.set(id, gameObj);
  forceSaveGame(id);

  return gameObj;
};

export const addUserToProposed = async (id: string, userId: string) => {
  const game = await getGame(id);

  if (!game) {
    console.error(`[addUserToProposed] Game with id ${id} not found`);
    throw new Error(`Game with id ${id} not found`);
  }

  const gameObj = toPlainGameObj(game);

  if (gameObj.gameFlow.proposed.includes(userId)) {
    console.log(`[addUserToProposed] User ${userId} already in proposed list`);
    return gameObj;
  }

  // Оновлюємо кеш миттєво
  gameObj.gameFlow.proposed.push(userId);
  gameCache.set(id, gameObj);
  markGameDirty(id);

  return gameObj;
};

export const addVote = async (
  id: string,
  targetUserId: string,
  voterId: string
) => {
  const game = await getGame(id);
  if (!game) return null;

  const gameObj = toPlainGameObj(game);
  if (!gameObj.gameFlow.voted) gameObj.gameFlow.voted = {};
  if (!gameObj.gameFlow.voted[targetUserId])
    gameObj.gameFlow.voted[targetUserId] = [];

  if (!gameObj.gameFlow.voted[targetUserId].includes(voterId)) {
    // Оновлюємо кеш
    gameObj.gameFlow.voted[targetUserId].push(voterId);
    gameCache.set(id, gameObj);
    markGameDirty(id);
  }

  return gameObj;
};

export const addShoot = async (
  id: string,
  targetUserId: string,
  shooterId: string,
  shot?: { x: number; y: number }
) => {
  const game = await getGame(id);
  if (!game) return null;

  const defaultShot = { x: 50, y: 50 };
  const actualShot = shot ?? defaultShot;

  const gameObj = toPlainGameObj(game);
  if (!gameObj.gameFlow.shoot) gameObj.gameFlow.shoot = {};
  if (!gameObj.gameFlow.shoot[targetUserId]) {
    gameObj.gameFlow.shoot[targetUserId] = { shooters: [], shots: [] };
  }

  // Оновлюємо кеш
  gameObj.gameFlow.shoot[targetUserId].shooters.push(shooterId);
  gameObj.gameFlow.shoot[targetUserId].shots.push(actualShot);
  gameCache.set(id, gameObj);
  markGameDirty(id);

  return gameObj;
};

export const findGameByPlayerId = async (playerId: string) =>
  Games.findOne({ players: playerId });

/**
 * Adds or removes a userId from the sleeping array in gameFlow.
 * @param add - true to add (player confirmed sleep), false to remove (player woke up)
 */
export const updateSleeping = async (
  id: string,
  userId: string,
  add: boolean
) => {
  const game = await getGame(id);
  if (!game) return null;

  const gameObj = toPlainGameObj(game);
  if (!gameObj.gameFlow.sleeping) gameObj.gameFlow.sleeping = [];

  const alreadySleeping = gameObj.gameFlow.sleeping.includes(userId);

  if (add && !alreadySleeping) {
    gameObj.gameFlow.sleeping.push(userId);
    gameCache.set(id, gameObj);
    markGameDirty(id);
  } else if (!add && alreadySleeping) {
    gameObj.gameFlow.sleeping = gameObj.gameFlow.sleeping.filter(
      (uid: string) => uid !== userId
    );
    gameCache.set(id, gameObj);
    markGameDirty(id);
  }

  return gameObj;
};
