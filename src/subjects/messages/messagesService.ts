import { Messages } from './messagesSchema';
import { IMessage } from './messagesTypes';
import { Populate } from '../DBTypes';

export const messagesPopulate = {
  path: Populate.Sender,
  populate: {
    path: Populate.Avatar,
  },
};

const messagesOptions = {
  limit: 100,
  populate: messagesPopulate,
};

export const getAllPublicMessages = async () =>
  await Messages.find({ 'to.type': 'all' }, undefined, messagesOptions);

export const getPrivateMessages = async (id: string, sender: string) =>
  await Messages.find({ 'to.type': 'user', 'to.id': id, sender });

export const getRoomMessages = async (id: string) =>
  await Messages.find(
    { 'to.type': 'room', 'to.id': id },
    undefined,
    messagesOptions
  );

export const createMessage = async (message: IMessage) =>
  Messages.create(message);
