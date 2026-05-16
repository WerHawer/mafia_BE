import { Messages } from './messagesSchema';
import { IMessage, ReactionMap } from './messagesTypes';
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
  sort: { createdAt: -1 },
};

export const getAllPublicMessages = async () =>
  await Messages.find({ 'to.type': 'all' }, undefined, messagesOptions);

export const getPrivateMessages = async (id: string, sender: string) =>
  await Messages.find(
    { 'to.type': 'user', 'to.id': id, sender },
    undefined,
    messagesOptions
  );

export const getRoomMessages = async (id: string) =>
  await Messages.find(
    { 'to.type': 'room', 'to.id': id },
    undefined,
    messagesOptions
  );

export const createMessage = async (message: IMessage) =>
  Messages.create(message);

export const toggleReaction = async (
  messageId: string,
  emojiUnified: string,
  userId: string
) => {
  const message = await Messages.findById(messageId);
  if (!message) return null;

  const reactions: ReactionMap = { ...((message.reactions as ReactionMap) ?? {}) };
  const existing = reactions[emojiUnified] ?? [];

  const next = existing.includes(userId)
    ? existing.filter((u) => u !== userId)
    : [...existing, userId];

  if (next.length === 0) delete reactions[emojiUnified];
  else reactions[emojiUnified] = next;

  return Messages.findByIdAndUpdate(messageId, { $set: { reactions } }, { new: true });
};
