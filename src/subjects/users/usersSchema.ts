import { model, Schema, Types } from 'mongoose';
import { IUser, IUserAvatar } from './usersTypes';
import { DBSubject } from '../DBTypes';

const avatarUrlsSchema = new Schema(
  {
    sm: { type: String, required: true },
    md: { type: String, required: true },
    lg: { type: String, required: true },
  },
  { _id: false }
);

const avatarSchema = new Schema<IUserAvatar>({
  urls: { type: avatarUrlsSchema, required: true },
});

export const Avatars = model(DBSubject.Avatars, avatarSchema);

const usersSchema = new Schema<IUser>({
  nikName: {
    type: String,
    unique: true,
    required: [true, 'Name is required'],
    minLength: [3, 'Name must be at least 3 characters long'],
    maxLength: [20, 'Name must be at most 20 characters long'],
  },
  friendList: { type: [String], required: true },
  isOnline: { type: Boolean, required: true },
  avatar: { type: [Types.ObjectId], ref: DBSubject.Avatars },
  password: String,
  refreshToken: String,
});

export const Users = model(DBSubject.Users, usersSchema);
