import { IUser } from '../users/usersTypes';

type To =
  | {
      type: 'all';
    }
  | {
      type: 'user' | 'room';
      id: string;
    };

export interface IMessage {
  text: string;
  sender: IUser;
  to: To;
  createdAt: number;
  isRead: boolean;
  _id?: string;
}
