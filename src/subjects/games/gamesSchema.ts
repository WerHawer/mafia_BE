import { model, Schema } from 'mongoose';
import { IGame } from './gamesTypes';
import { DBSubject } from '../DBTypes';

const gamesSchema = new Schema<IGame>({
  owner: { type: String, required: true },
  players: {
    type: [String],
    required: true,
  },
  password: String,
  isPrivate: Boolean,
  isActive: { type: Boolean, required: true },
  gm: { type: String, required: true },
  mafia: [String],
  citizens: [String],
  sheriff: String,
  doctor: String,
  maniac: String,
  prostitute: String,
  startTime: Number || null,
  finishTime: Number || null,
  creatingTime: { type: Number, required: true },
  gameType: { type: String, required: true },
  gameFlow: {
    speaker: String,
    speakTime: { type: Number, required: true },
    isStarted: { type: Boolean, required: true },
    isFinished: { type: Boolean, required: true },
    isNight: { type: Boolean, required: true },
    isVoteTime: { type: Boolean, required: true },
    day: { type: Number, required: true },
    proposed: [String],
    killed: [String],
  },
});

export const Games = model<IGame>(DBSubject.Games, gamesSchema);
