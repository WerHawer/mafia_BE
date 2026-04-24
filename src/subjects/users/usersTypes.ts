import { Types } from 'mongoose';

export interface IUser {
  nikName: string;
  friendList: [];
  isOnline: boolean;
  avatar?: IUserAvatar[] | Types.ObjectId[];
  password?: string;
  refreshToken?: string;
  // history: [],
}

export interface IUserCreate {
  login: string;
  name: string;
  nikName?: string;
  password: string;
}

export interface IUserAvatarUrls {
  sm: string;
  md: string;
  lg: string;
}

export interface IUserAvatar {
  urls: IUserAvatarUrls;
  id?: Types.ObjectId;
}
