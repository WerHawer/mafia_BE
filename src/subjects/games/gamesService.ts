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

export const forceSaveGame = async (id: string) => {
  dirtyGames.delete(id.toString()); // Видаляємо з черги агрегатора
  const gameObj = gameCache.get(id) as any;
  if (!gameObj) return;

  const copy = { ...gameObj };
  delete copy._id;

  const startDb = Date.now();
  try {
    await Games.updateOne({ _id: id }, { $set: copy }).exec();
    console.log(`[DB Force Save] Game ${id} saved instantly in ${Date.now() - startDb}ms`);
  } catch(e) {
    console.error('[DB Force Save Error]:', e);
  }
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
  candidateSpeakTime: 30,
  votesTime: 15,
  isStarted: false,
  isFinished: false,
  isPostGame: false,
  isNight: false,
  isVote: false,
  isReVote: false,
  isExtraSpeech: false,
  day: 0,
  proposed: [],
  proposedBy: {},
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
  observers: [],
  gameFlow: initialGameFlow,
};

const resetDayNightFlow = {
  'gameFlow.speaker': '',
  'gameFlow.proposed': [],
  'gameFlow.proposedBy': {},
  'gameFlow.shoot': {},
  'gameFlow.voted': {},
  'gameFlow.isVote': false,
  'gameFlow.isReVote': false,
  'gameFlow.isExtraSpeech': false,
  'gameFlow.wakeUp': '',
  'gameFlow.sheriffCheck': '',
  'gameFlow.donCheck': '',
  'gameFlow.prostituteBlockPos': undefined,
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

// Per-game serialization map — ensures concurrent addGamePlayers / removeGamePlayers
// calls for the same game are processed sequentially.
// This prevents the Last-Write-Wins race condition where simultaneous reads return
// the same stale snapshot and each writer only appends their own player, so the last
// write wins and earlier players are lost from the cache.
//
// NOTE: This is a single-process in-memory lock and is sufficient for a single-server
// deployment. For multi-process / multi-instance setups, use a Redis-based lock or
// MongoDB's $addToSet atomic operator instead.
const gameLocks = new Map<string, Promise<void>>();

/**
 * Executes `fn` exclusively for the given gameId — any concurrent call will
 * wait for the current execution to finish before starting.
 */
const withGameLock = <T>(gameId: string, fn: () => Promise<T>): Promise<T> => {
  const prev = gameLocks.get(gameId) ?? Promise.resolve();

  // Chain fn onto the previous promise so it runs only after the previous call finishes.
  // The outer .then(() => {}, () => {}) strips the return value so the lock entry stays
  // a Promise<void> regardless of what fn returns or throws.
  const current = prev.then(fn);
  gameLocks.set(
    gameId,
    current.then(
      () => {},
      () => {}
    )
  );

  return current;
};

export const addGamePlayers = (id: string, playerId: string) =>
  withGameLock(id, async () => {
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
      await forceSaveGame(id);
    }

    console.log(
      `[addGamePlayers] Current players: (count: ${gameObj.players.length})`
    );

    return gameObj;
  });

export const removeGamePlayers = (id: string, playerId: string) =>
  withGameLock(id, async () => {
    const game = await getGame(id);
    if (!game) return null;

    const gameObj = toPlainGameObj(game);
    const index = gameObj.players.indexOf(playerId);

    if (index > -1) {
      gameObj.players.splice(index, 1);
      gameCache.set(id, gameObj);
      // Player leave is a key event — force immediate DB sync instead of waiting for the aggregator
      await forceSaveGame(id);
      console.log(
        `[removeGamePlayers] Successfully removed player ${playerId} (left: ${gameObj.players.length})`
      );
    } else {
      console.error(
        `[removeGamePlayers] Failed to find player ${playerId} in game ${id}`
      );
    }

    return gameObj;
  });

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

export const finishGame = async (id: string) => {
  const game = await getGame(id);
  if (!game) return null;

  const gameObj = toPlainGameObj(game);

  gameObj.gameFlow.isStarted = false;
  gameObj.gameFlow.isFinished = true;
  gameObj.gameFlow.isPostGame = true;

  // Clear observers so everyone "revives" for post-game discussion
  gameObj.observers = [];

  // Reset transient day/night flow state, but KEEP roles
  gameObj.gameFlow.speaker = '';
  gameObj.gameFlow.proposed = [];
  gameObj.gameFlow.proposedBy = {};
  gameObj.gameFlow.shoot = {};
  gameObj.gameFlow.voted = {};
  gameObj.gameFlow.isVote = false;
  gameObj.gameFlow.isReVote = false;
  gameObj.gameFlow.isExtraSpeech = false;
  gameObj.gameFlow.wakeUp = '';
  gameObj.gameFlow.sheriffCheck = '';
  gameObj.gameFlow.donCheck = '';
  gameObj.gameFlow.prostituteBlockPos = undefined;
  gameObj.gameFlow.prostituteBlock = '';
  gameObj.gameFlow.doctorSave = '';
  gameObj.gameFlow.killed = [];
  gameObj.gameFlow.sleeping = [];
  gameObj.gameFlow.day = 0;

  gameCache.set(id, gameObj);
  forceSaveGame(id);

  return gameObj;
};

/**
 * Fisher-Yates shuffle — повертає новий перемішаний масив.
 */
const shuffleArray = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const startGame = async (id: string) => {
  const game = await getGame(id);
  if (!game) return null;

  const gameObj = toPlainGameObj(game);

  // --- Перемішування гравців ---
  // Перемішуємо всіх гравців на початку, щоб черга мовлення була випадковою
  const playersBefore = [...(gameObj.players as string[])];
  gameObj.players = shuffleArray(gameObj.players as string[]);
  console.log(`[startGame] Shuffling players for game ${id}. Before: ${playersBefore.length} players. Order changed: ${JSON.stringify(playersBefore) !== JSON.stringify(gameObj.players)}`);

  // --- Розподіл ролей ---
  // Беремо всіх гравців, крім GM, з уже перемішаного списку
  const gmId = gameObj.gm?.toString();
  const activePlayers: string[] = (gameObj.players as string[]).filter(
    (p) => p.toString() !== gmId
  );

  const playersCount = activePlayers.length;

  // Формула: 8+ → 3 мафії, 7 → 2, ≤6 → 1
  const mafiaCount =
    playersCount >= 8 ? 3 : playersCount === 7 ? 2 : 1;

  // Оскільки ми вже перемішали gameObj.players, activePlayers також у випадковому порядку.
  // Але для додаткової впевненості у розподілі ролей можемо перемішати ще раз самі активні ролі.
  const shuffled = shuffleArray(activePlayers);
  let pool = [...shuffled];

  // Перші mafiaCount — мафія (перший є Доном)
  const mafia = pool.splice(0, mafiaCount);

  // Обов'язково Шериф
  const sheriff = pool.splice(0, 1)[0];

  // Додаткові ролі з additionalRoles (якщо є і якщо є достатньо гравців)
  const additionalRoles: string[] = gameObj.additionalRoles ?? [];
  let doctor: string | undefined;
  let prostitute: string | undefined;
  let maniac: string | undefined;

  for (const role of additionalRoles) {
    if (pool.length === 0) break;
    const lowerRole = role.toLowerCase();
    if (lowerRole === 'doctor' && !doctor) {
      doctor = pool.splice(0, 1)[0];
    } else if ((lowerRole === 'prostitute' || lowerRole === 'putana') && !prostitute) {
      prostitute = pool.splice(0, 1)[0];
    } else if (lowerRole === 'maniac' && !maniac) {
      maniac = pool.splice(0, 1)[0];
    }
  }

  // Решта — мирні
  const citizens = pool;

  // Записуємо ролі та mafiaCount
  gameObj.mafiaCount = mafiaCount;
  gameObj.mafia = mafia;
  gameObj.sheriff = sheriff;
  gameObj.doctor = doctor ?? '';
  gameObj.prostitute = prostitute ?? '';
  gameObj.maniac = maniac ?? '';
  gameObj.citizens = citizens;
  // ----------------------

  gameObj.isActive = true;
  gameObj.startTime = Date.now();
  gameObj.gameFlow.isStarted = true;
  gameObj.gameFlow.isFinished = false;
  gameObj.gameFlow.isPostGame = false;
  gameObj.gameFlow.day = 1;

  gameCache.set(id, gameObj);
  forceSaveGame(id);

  console.log(
    `[startGame] Game ${id} started. Players: ${playersCount}, Mafia: ${mafiaCount}, ` +
    `Don: ${mafia[0]}, Sheriff: ${sheriff}, Doctor: ${doctor ?? '-'}, ` +
    `Prostitute: ${prostitute ?? '-'}, Maniac: ${maniac ?? '-'}, Citizens: ${citizens.length}`
  );

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
  if (!newProstituteBlock) {
    delete gameObj.gameFlow.prostituteBlockPos;
  }
  gameObj.gameFlow.day = (gameObj.gameFlow.day || 0) + 1;

  // Manual resetDayNightFlow mapping
  gameObj.gameFlow.speaker = '';
  gameObj.gameFlow.proposed = [];
  gameObj.gameFlow.proposedBy = {};
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
  delete gameObj.gameFlow.prostituteBlockPos;
  gameObj.gameFlow.doctorSave = '';

  // Manual resetDayNightFlow mapping
  gameObj.gameFlow.speaker = '';
  gameObj.gameFlow.proposed = [];
  gameObj.gameFlow.proposedBy = {};
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

export const addUserToProposed = async (id: string, userId: string, proposerId: string) => {
  const game = await getGame(id);

  if (!game) {
    console.error(`[addUserToProposed] Game with id ${id} not found`);
    throw new Error(`Game with id ${id} not found`);
  }

  const gameObj = toPlainGameObj(game);

  if (!gameObj.gameFlow.proposedBy) {
    gameObj.gameFlow.proposedBy = {};
  }

  if (gameObj.gameFlow.proposed.includes(userId)) {
    console.log(`[addUserToProposed] User ${userId} already in proposed list`);
    return gameObj;
  }

  if (Object.values(gameObj.gameFlow.proposedBy).includes(proposerId)) {
    console.log(`[addUserToProposed] Proposer ${proposerId} already proposed someone`);
    return gameObj;
  }

  // Оновлюємо кеш миттєво
  gameObj.gameFlow.proposed.push(userId);
  gameObj.gameFlow.proposedBy[userId] = proposerId;
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
  if (targetUserId === voterId) {
    console.error(`[addVote] Player ${voterId} tried to vote for themselves`);
    return gameObj;
  }

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

export const setObserverMode = async (id: string, userId: string) => {
  const game = await getGame(id);
  if (!game) return null;

  const gameObj = toPlainGameObj(game);
  if (!gameObj.observers) gameObj.observers = [];

  if (!gameObj.observers.includes(userId)) {
    gameObj.observers.push(userId);
    gameCache.set(id, gameObj);
    markGameDirty(id);
  }

  return gameObj;
};
