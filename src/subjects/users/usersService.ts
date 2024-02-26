import { Avatars, Users } from './usersSchema';
import { IUser } from './usersTypes';
import { Populate } from '../DBTypes';
import { Types } from 'mongoose';

export const getUsers = async () =>
  Users.find({}, undefined, { populate: Populate.Avatar });

export const getUserById = async (id: string) =>
  Users.findById(id, undefined, { populate: Populate.Avatar });

export const createUser = async (user: IUser) => Users.create(user);

export const updateUser = async (id: string, user: Partial<IUser>) =>
  Users.findByIdAndUpdate(id, user, { new: true, populate: Populate.Avatar });

export const uploadUserAvatar = async (avatar: string) =>
  Avatars.create({ url: avatar });

export const updateUserAvatar = async (
  id: string,
  avatar: { avatar: Types.ObjectId }
) =>
  Users.findByIdAndUpdate(id, avatar, {
    new: true,
    populate: Populate.Avatar,
  });

export const deleteUser = async (id: string) => Users.findByIdAndDelete(id);

export const deleteUserAvatar = async (id: string) =>
  Avatars.findByIdAndDelete(id);
