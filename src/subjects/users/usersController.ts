import * as userService from './usersService';
import { NextFunction, Response, Request } from 'express';
import { idFormatValidation } from '../../helpers/idFormatValidation';
import { createNewUserObj } from '../../helpers/createNewUser';
import { deleteFileFromAWS, uploadFileToAWS } from '../../awsSdk';
import { Populate } from '../DBTypes';
import { dataNormalize } from '../../helpers/dataNormalize';
import { IUserAvatar } from './usersTypes';

export const getAllUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const users = await userService.getUsers();

    res.sendResponse(users);
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  if (!idFormatValidation(id)) return res.status(400).send('Invalid ID format');

  try {
    const user = await userService.getUserById(id);

    if (!user) {
      return res.status(404).send(`User with id: ${id} not found`);
    }

    res.sendResponse(user);
  } catch (error) {
    next(error);
  }
};

export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const newUser = createNewUserObj(req.body);

  try {
    const user = await userService.createUser(newUser);

    res.sendResponse(user);
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  if (!idFormatValidation(id)) return res.status(400).send('Invalid ID format');

  try {
    const user = await userService.updateUser(id, req.body);

    if (!user) {
      return res.status(404).send(`User with id: ${id} not found`);
    }

    res.sendResponse(user);
  } catch (error) {
    next(error);
  }
};

export const updateUserAvatar = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  if (!idFormatValidation(id)) return res.status(400).send('Invalid ID format');

  if (!req.file) return res.status(400).send('No file uploaded.');

  const { description } = req.body;
  const { path, filename } = req.file;
  const dateName = `${Date.now()}_${filename}`;

  try {
    const user = await userService.getUserById(id);

    if (!user) {
      return res.status(404).send(`User with id: ${id} not found`);
    }

    const avatarUrl = await uploadFileToAWS(path, dateName);
    const avatar = await userService.uploadUserAvatar(avatarUrl);

    const prevAvatar = user.avatar?.[0] as IUserAvatar;

    if (prevAvatar) {
      await userService.deleteUserAvatar(`${prevAvatar.id}`);
      const prevAvatarName = prevAvatar.url.split('/').pop();
      await deleteFileFromAWS(prevAvatarName);
    }

    user.avatar = [avatar._id];

    await user.save();
    await user.populate(Populate.Avatar);

    const normalizedUser = dataNormalize(user);

    res.json({
      description,
      user: normalizedUser,
      message: 'Avatar updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  if (!idFormatValidation(id)) return res.status(400).send('Invalid ID format');

  try {
    const user = await userService.deleteUser(id);

    if (!user) {
      return res.status(404).send(`User with id: ${id} not found`);
    }

    res.sendResponse(user);
  } catch (error) {
    next(error);
  }
};

export const deleteUserAvatar = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { avatarId } = req.params;

  if (!idFormatValidation(avatarId))
    return res.status(400).send('Invalid Avatar ID format');

  try {
    await userService.deleteUserAvatar(avatarId);

    res.status(200).json({ message: 'Avatar deleted successfully' });
  } catch (error) {
    next(error);
  }
};
