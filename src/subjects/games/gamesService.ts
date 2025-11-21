import { Games } from './gamesSchema';
import { IGame } from './gamesTypes';

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
  creatingTime: Date.now(),
  gameFlow: initialGameFlow,
};

const resetDayNightFlow = {
  'gameFlow.speaker': '',
  'gameFlow.proposed': [],
  'gameFlow.shoot': {},
  'gameFlow.voted': {},
  'gameFlow.isVote': false,
  'gameFlow.isExtraSpeech': false,
  'gameFlow.wakeUp': '',
  'gameFlow.sheriffCheck': '',
  'gameFlow.donCheck': '',
};

export const getGames = async () => Games.find({}, undefined, { limit: 100 });

export const getActiveGames = async () =>
  Games.find({ isActive: true }, undefined, { limit: 100 });

export const getGame = async (id: string) => Games.findById(id);

export const createGame = async (game: IGame) => Games.create(game);

export const updateGame = async (id: string, game: Partial<IGame>) =>
  Games.findOneAndUpdate(
    { _id: id },
    { $set: game },
    {
      new: true,
      uesFindAndModify: false,
    }
  );

export const addGamePlayers = async (id: string, playerId: string) => {
  const game = await Games.findById(id);

  if (!game) {
    console.error(`[addGamePlayers] Game with id ${id} not found`);
    throw new Error(`Game with id ${id} not found`);
  }

  console.log(
    `[addGamePlayers] Current players:`,
    game.players,
    `(count: ${game.players.length})`
  );

  if (game.players.includes(playerId)) {
    return game;
  }

  return Games.findOneAndUpdate(
    { _id: id },
    { $addToSet: { players: playerId } },
    { new: true }
  );
};

export const removeGamePlayers = async (id: string, playerId: string) => {
  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    { $pull: { players: playerId } },
    { new: true }
  );

  if (updatedGame) {
    console.log(
      `[removeGamePlayers] Successfully removed player ${playerId}. Remaining players:`,
      updatedGame.players,
      `(count: ${updatedGame.players.length})`
    );
  } else {
    console.error(
      `[removeGamePlayers] Failed to remove player from game ${id}`
    );
  }

  return updatedGame;
};

export const addGameRoles = async (id: string, roles: Partial<IGame>) =>
  Games.findOneAndUpdate(
    { _id: id },
    { $set: roles },
    { new: true, uesFindAndModify: false }
  );

export const restartGame = async (id: string) =>
  Games.findOneAndUpdate(
    { _id: id },
    { $set: initialGame },
    { new: true, uesFindAndModify: false }
  );

export const startGame = async (id: string) => {
  return Games.findOneAndUpdate(
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
};

export const startDay = async (id: string) => {
  return Games.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        'gameFlow.isNight': false,
        ...resetDayNightFlow,
      },
      $inc: {
        'gameFlow.day': 1,
      },
    },
    { new: true, uesFindAndModify: false }
  );
};

export const startNight = async (id: string) => {
  return Games.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        'gameFlow.isNight': true,
        ...resetDayNightFlow,
      },
    },
    { new: true, uesFindAndModify: false }
  );
};

export const addUserToProposed = async (id: string, userId: string) => {
  return Games.findOneAndUpdate(
    { _id: id },
    { $addToSet: { 'gameFlow.proposed': userId } },
    { new: true }
  );
};

export const addVote = async (
  id: string,
  targetUserId: string,
  voterId: string
) => {
  return Games.findOneAndUpdate(
    { _id: id },
    { $addToSet: { [`gameFlow.voted.${targetUserId}`]: voterId } },
    { new: true }
  );
};

export const addShoot = async (
  id: string,
  targetUserId: string,
  shooterId: string
) => {
  return Games.findOneAndUpdate(
    { _id: id },
    { $addToSet: { [`gameFlow.shoot.${targetUserId}`]: shooterId } },
    { new: true }
  );
};
