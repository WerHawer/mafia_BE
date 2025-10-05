import { IGame, IGameShort } from '../subjects/games/gamesTypes';

export const createGamesShortData = (game: IGame): IGameShort => ({
  id: game.id,
  owner: game.owner,
  playersCount: game.players.length,
  isPrivate: game.isPrivate,
  isActive: game.isActive,
  gm: game.gm,
  gameType: game.gameType,
  creatingTime: game.creatingTime,
});
