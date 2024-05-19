import { IUser, IUserCreate } from '../subjects/users/usersTypes';
import bCrypt from 'bcryptjs';

export const createNewUserObj = (user: IUserCreate): IUser => {
  const { password, nickName } = user;

  const cryptedPassword = bCrypt.hashSync(password, bCrypt.genSaltSync(6));

  return {
    password: cryptedPassword,
    nickName,
    friendList: [],
    isOnline: true,
  };
};
