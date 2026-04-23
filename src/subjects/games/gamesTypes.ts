import { IUser } from '../users/usersTypes';

export enum GameType {
  Standard = 'standard',
  Expand = 'expand',
}

export interface IGameFlow {
  speaker: string;
  speakTime: number;
  candidateSpeakTime: number;
  votesTime: number;
  isStarted: boolean;
  isFinished: boolean;
  isNight: boolean;
  isVote: boolean;
  isReVote: boolean;
  isExtraSpeech: boolean;
  day: number;
  proposed: string[];
  proposedBy: Record<string, string>;
  voted: Record<string, string[]>;
  wakeUp: string[] | string;
  shoot: Record<string, { shooters: string[]; shots: { x: number; y: number }[] }>;
  killed: string[];
  sheriffCheck?: string;
  doctorSave?: string;
  donCheck?: string;
  prostituteBlock?: string;
  prostituteBlockPos?: { x: number; y: number };
  sleeping: string[];
}

export interface IGame {
  id?: string;
  owner: string;
  players: string[];
  maxPlayers: number;
  password?: string;
  isPrivate: boolean;
  isActive: boolean;
  gm: string;
  mafiaCount: number;
  skipFirstNightIfOneMafia?: boolean;
  additionalRoles: string[];
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

export interface IGameShort {
  id?: string;
  owner: string;
  playersCount: number;
  maxPlayers: number;
  isPrivate: boolean;
  isActive: boolean;
  isStarted: boolean;
  gm: string;
  gameType: GameType;
  creatingTime: number;
  mafiaCount: number;
  skipFirstNightIfOneMafia?: boolean;
  additionalRoles: string[];
}

export interface IGameDTO extends Omit<IGame, 'players'> {
  players: IUser[];
}
