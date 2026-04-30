import { IGame, IGameShort } from '../subjects/games/gamesTypes';

export const createGamesShortData = (game: IGame): IGameShort => ({
  id: game?.id ?? (game as any)?._id?.toString(),
  owner: game?.owner,
  playersCount: game?.players?.length || 0,
  isPrivate: game?.isPrivate,
  isActive: game?.isActive,
  isStarted: game?.gameFlow?.isStarted ?? false,
  gm: game?.gm,
  gameType: game?.gameType,
  creatingTime: game?.creatingTime,
  maxPlayers: game?.maxPlayers,
  mafiaCount: game?.mafiaCount,
  skipFirstNightIfOneMafia: game?.skipFirstNightIfOneMafia,
  observers: game?.observers || [],
  additionalRoles: game?.additionalRoles,
});
