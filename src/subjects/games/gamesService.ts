import { Games } from './gamesSchema';
import { IGame } from './gamesTypes';
import { Populate } from '../DBTypes';

export const gamePopulateOption = [
  Populate.Players,
  Populate.GM,
  Populate.Owner,
];

const gamesOptions = {
  populate: gamePopulateOption,
};

export const getGames = async () =>
  Games.find({}, undefined, { ...gamesOptions, limit: 100 });

export const getGame = async (id: string) =>
  Games.findById(id, undefined, gamesOptions);

export const createGame = async (game: IGame) => Games.create(game);

export const updateGame = async (id: string, game: Partial<IGame>) =>
  Games.findByIdAndUpdate(id, game, {
    ...gamesOptions,
    new: true,
  });
