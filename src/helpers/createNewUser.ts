import { IUser, IUserCreate } from '../subjects/users/usersTypes';
import bCrypt from 'bcryptjs';

export const createNewUserObj = (user: IUserCreate): IUser => {
  const { login, password, nikName, name } = user;

  const cryptedPassword = bCrypt.hashSync(password, bCrypt.genSaltSync(6));

  return {
    login,
    password: cryptedPassword,
    nikName,
    name,
    friendList: [],
    isOnline: true,
  };
};
