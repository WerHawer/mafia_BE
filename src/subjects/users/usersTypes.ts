import { Types } from 'mongoose';

export interface IUser {
  email: string;
  name: string;
  nikName?: string;
  friendList: [];
  isOnline: true;
  avatar?: IUserAvatar[];
  password?: string;
  // history: [],
}

export interface IUserCreate {
  email: string;
  name: string;
  nikName?: string;
  password: string;
}

export interface IUserDTO extends Omit<IUser, 'avatar'> {
  avatar: IUserAvatar;
}

export interface IUserAvatar {
  url: string;
  id?: Types.ObjectId;
}
