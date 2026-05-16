import { IUser } from '../users/usersTypes';

type To =
  | {
      type: 'all';
    }
  | {
      type: 'user' | 'room';
      id: string;
    };

export type ReactionMap = Record<string, string[]>; // emojiUnified → userId[]

export interface IMessage {
  text: string;
  sender: IUser;
  to: To;
  createdAt: number;
  isRead: boolean;
  _id?: string;
  reactions?: ReactionMap;
}
