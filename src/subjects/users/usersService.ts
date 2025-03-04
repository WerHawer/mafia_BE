import { Avatars, Users } from './usersSchema';
import { IUser } from './usersTypes';
import { Populate } from '../DBTypes';

const usersOptions = {
  populate: Populate.Avatar,
};

export const getUsers = async () =>
  Users.find({}, undefined, { ...usersOptions, limit: 100 });

export const getUserById = async (id: string) =>
  Users.findById(id, undefined, usersOptions);

export const getUserByNikName = async (nikName: string) =>
  Users.findOne({ nikName }, undefined, usersOptions);

export const createUser = async (user: IUser) => Users.create(user);

export const updateUser = async (id: string, user: Partial<IUser>) =>
  Users.findByIdAndUpdate(id, user, { ...usersOptions, new: true });

export const uploadUserAvatar = async (avatar: string) =>
  Avatars.create({ url: avatar });

export const deleteUser = async (id: string) => Users.findByIdAndDelete(id);

export const deleteUserAvatar = async (id: string) =>
  Avatars.findByIdAndDelete(id);

export const getUsersByIds = async (ids: string[]) =>
  Users.find({ _id: { $in: ids } }, undefined, usersOptions);
