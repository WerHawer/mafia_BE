import { Messages } from './messagesSchema';
import { IMessage } from './messagesTypes';
import { Populate } from '../DBTypes';

export const getAllPublicMessages = async () =>
  await Messages.find({ 'to.type': 'all' }, undefined, {
    limit: 100,
    populate: Populate.Sender,
  });

export const getPrivateMessages = async (id: string, sender: string) =>
  await Messages.find({ 'to.type': 'user', 'to.id': id, sender });

export const getRoomMessages = async (id: string) =>
  await Messages.find({ 'to.type': 'room', 'to.id': id }, undefined, {
    limit: 100,
    populate: Populate.Sender,
  });

export const createMessage = async (message: IMessage) =>
  Messages.create(message);
