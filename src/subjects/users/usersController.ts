import * as userService from './usersService';
import { NextFunction, Request, Response } from 'express';
import { idFormatValidation } from '../../helpers/idFormatValidation';
import { createNewUserObj } from '../../helpers/createNewUser';
import {
  deleteFileFromAWS,
  uploadFileToAWS,
  checkImageModeration,
} from '../../awsSdk';
import { Populate } from '../DBTypes';
import { IUserAvatar } from './usersTypes';
import { createToken } from '../../helpers/createToken';
import { createRefreshToken } from '../../helpers/createRefreshToken';
import { comparePassword } from '../../helpers/comparePassword';
import jwt from 'jsonwebtoken';
import { getSecret } from '../../helpers/getSecret';
import * as messagesService from '../messages/messagesService';
import { wsEvents, userSocketMap } from '../../wsFlow';
import { dataNormalize } from '../../helpers/dataNormalize';

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

  if (!idFormatValidation(id))
    return res.sendError({ message: 'Invalid ID format' });

  try {
    const user = await userService.getUserById(id);

    if (!user) {
      return res.sendError({
        message: `User with id: ${id} not found`,
        status: 404,
      });
    }

    res.sendResponse(user);
  } catch (error) {
    next(error);
  }
};

export const getUsersByIds = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const ids = req.query.ids as string;

  if (!ids) {
    return res.sendError({ message: 'No ids provided', status: 400 });
  }

  try {
    const idsArr = ids.split(',');
    const users = await userService.getUsersByIds(idsArr);

    if (!users) {
      return res.sendError({
        message: `Users with ids: ${ids} not found`,
        status: 404,
      });
    }

    res.sendResponse(users);
  } catch (error) {
    next(error);
  }

  return;
};

export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const newUser = createNewUserObj(req.body);
  const { nikName } = newUser;

  if (!nikName) {
    return res.sendError({
      message: 'Login is required',
      status: 400,
      field: 'login',
    });
  }

  const userByLogin = await userService.getUserByNikName(nikName);

  if (userByLogin) {
    return res.sendError({
      message: 'User with this login already exists',
      status: 400,
      field: 'login',
    });
  }

  try {
    const user = await userService.createUser(newUser);
    const { id, nikName } = user;

    const token = createToken({ id, nikName });
    const refreshToken = createRefreshToken({ id, nikName });

    await userService.updateUser(`${id}`, { refreshToken });

    res.sendResponse({ user, token, refreshToken }, 201);
  } catch (error) {
    next(error);
  }
};

export const loginUser = async (req: Request, res: Response) => {
  const { login, password } = req.body;
  const user = await userService.getUserByNikName(login);

  if (!user) {
    return res.sendError({
      message: 'User with this login does not exist',
      status: 400,
      field: 'login',
    });
  }

  const isPasswordCorrect = comparePassword(password, user.password);

  if (!isPasswordCorrect) {
    return res.sendError({
      message: 'Password is incorrect',
      status: 400,
      field: 'password',
    });
  }

  const { id, nikName } = user;
  const token = createToken({ id, nikName });
  const refreshToken = createRefreshToken({ id, nikName });

  await userService.updateUser(`${id}`, { refreshToken });

  res.sendResponse({ user, token, refreshToken });
};

export const refreshUserToken = async (req: Request, res: Response, next: NextFunction) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.sendError({ message: 'Refresh token is required', status: 401 });
  }

  try {
    const secret = getSecret();
    let payload;
    try {
      payload = jwt.verify(refreshToken, secret) as any;
    } catch(err) {
      return res.sendError({ message: 'Invalid refresh token', status: 403 });
    }

    const user = await userService.getUserById(payload.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.sendError({ message: 'Invalid refresh token', status: 403 });
    }

    const { id, nikName } = user;
    const newToken = createToken({ id, nikName });
    const newRefreshToken = createRefreshToken({ id, nikName });

    await userService.updateUser(`${id}`, { refreshToken: newRefreshToken });

    res.sendResponse({ token: newToken, refreshToken: newRefreshToken });
  } catch (error) {
    next(error);
  }
};

export const logoutUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.user as any;

    await userService.updateUser(`${id}`, { refreshToken: '' });
    await userService.setUserOnlineStatus(`${id}`, false);

    // Notify all clients immediately — no need to wait for the 30s grace timer
    res.io.emit(wsEvents.userOnlineStatusChanged, { userId: id, isOnline: false });

    // Force-disconnect the socket so the BE cleans up game membership right away
    const socketId = userSocketMap.get(`${id}`);
    if (socketId) {
      const socket = res.io.sockets.sockets.get(socketId);
      if (socket) {
        // Remove from map before disconnecting to suppress the redundant 30s grace timer
        userSocketMap.delete(`${id}`);
        // Signal the disconnect handler to skip the grace timer and status update
        socket.data.isLoggedOut = true;
        socket.disconnect(true);
        console.log(`[Logout] Force-disconnected socket ${socketId} for user ${id}`);
      }
    }

    res.sendResponse({ message: 'Logged out successfully' });
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

    // Check content BEFORE uploading to S3 — avoids unnecessary upload + delete cycle
    const moderation = await checkImageModeration(path);

    if (!moderation.safe) {
      const isServiceUnavailable =
        moderation.reason === 'Content moderation service unavailable';

      return res.status(400).json({
        message: isServiceUnavailable
          ? 'Unable to process image at this time. Please try again later.'
          : `Image contains inappropriate content and cannot be used as an avatar. ${isServiceUnavailable ? undefined : moderation.reason}`,
      });
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

    // Оновлення повідомлень (з новими аватарками) та розсилка всім підключеним
    const updatedMessages = await messagesService.getAllPublicMessages();
    const normalizedMessages = dataNormalize(updatedMessages);

    // Скидання кешу повідомлень на фронтендах (усіх клієнтів)
    res.io.emit(wsEvents.messagesUpdate, normalizedMessages);

    res.sendResponse({
      description,
      user,
      messages: normalizedMessages,
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

    // Скидання кешу повідомлень і розсилка оновленого списку (без аватарки)
    const updatedMessages = await messagesService.getAllPublicMessages();
    const normalizedMessages = dataNormalize(updatedMessages);

    res.io.emit(wsEvents.messagesUpdate, normalizedMessages);

    // Зверніть увагу: ми використовуємо розширений sendResponse
    res.sendResponse({
      message: 'Avatar deleted successfully',
      messages: normalizedMessages
    });
  } catch (error) {
    next(error);
  }
};
