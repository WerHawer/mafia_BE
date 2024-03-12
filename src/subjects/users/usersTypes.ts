import { Types } from 'mongoose';

export interface IUser {
  email: string;
  name: string;
  nikName?: string;
  friendList: [];
  isOnline: true;
  avatar?: IUserAvatar[] | Types.ObjectId[];
  password?: string;
  // history: [],
}

export interface IUserCreate {
  email: string;
  name: string;
  nikName?: string;
  password: string;
}

export interface IUserAvatar {
  url: string;
  id?: Types.ObjectId;
}
