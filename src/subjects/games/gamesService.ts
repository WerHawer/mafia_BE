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
  killed: [],
  shoot: [],
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

export const addGamePlayers = async (id: string, playerId: string) =>
  Games.findOneAndUpdate(
    { _id: id },
    { $addToSet: { players: playerId } },
    { new: true }
  );

export const removeGamePlayers = async (id: string, playerId: string) =>
  Games.findOneAndUpdate(
    { _id: id },
    { $pull: { players: playerId } },
    { new: true }
  );

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
