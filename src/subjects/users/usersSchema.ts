import { model, Schema, Types } from 'mongoose'
import { IUser, IUserAvatar } from './usersTypes'
import { DBSubject } from '../DBTypes'

const avatarSchema = new Schema<IUserAvatar>({
  url: { type: String, required: true },
})

export const Avatars = model(DBSubject.Avatars, avatarSchema)

const usersSchema = new Schema<IUser>({
  email: { type: String, unique: true, required: true },
  name: {
    type: String,
    required: [true, 'Name is required'],
    minLength: [3, 'Name must be at least 3 characters long'],
    maxLength: [20, 'Name must be at most 20 characters long'],
  },
  nikName: String,
  friendList: { type: [String], required: true },
  isOnline: { type: Boolean, required: true },
  avatar: { type: [Types.ObjectId], ref: DBSubject.Avatars },
  password: String,
})

export const Users = model(DBSubject.Users, usersSchema)
