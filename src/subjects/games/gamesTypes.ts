import { IUser } from '../users/usersTypes';

export enum GameType {
  Standard = 'standard',
  Expand = 'expand',
}

export interface IGameFlow {
  speaker: string;
  speakTime: number;
  votesTime: number;
  isStarted: boolean;
  isFinished: boolean;
  isNight: boolean;
  isVote: boolean;
  isReVote: boolean;
  isExtraSpeech: boolean;
  day: number;
  proposed: string[];
  voted: Record<string, string[]>;
  wakeUp: string[] | string;
  shoot: [string, string][];
  killed: string[];
  sheriffCheck?: string;
  doctorSave?: string;
  donCheck?: string;
}

export interface IGame {
  owner: string;
  players: string[];
  password?: string;
  isPrivate: boolean;
  isActive: boolean;
  gm: string;
  mafia?: string[];
  citizens?: string[];
  sheriff?: string;
  doctor?: string;
  maniac?: string;
  prostitute?: string;
  startTime: number | null;
  finishTime: number | null;
  creatingTime: number;
  gameType: GameType;
  gameFlow: IGameFlow;
}

export interface IGameDTO extends Omit<IGame, 'players'> {
  players: IUser[];
}
