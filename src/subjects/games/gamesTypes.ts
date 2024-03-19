import { IUser } from '../users/usersTypes';

export interface IGame {
  owner: string;
  players: string[];
  password?: string;
  isPrivate: boolean;
  isActive: boolean;
  day: number;
  gm: string;
  mafia: string[];
  citizens: string[];
  cherif: string | null;
  doctor: string | null;
  maniac?: string | null;
  slut?: string | null;
  killed: string[];
  startTime: number | null;
  finishTime: number | null;
}

export interface IGameDTO extends Omit<IGame, 'players'> {
  players: IUser[];
}
