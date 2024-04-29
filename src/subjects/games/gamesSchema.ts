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
    votesTime: { type: Number, required: true },
    isStarted: { type: Boolean, required: true },
    isFinished: { type: Boolean, required: true },
    isNight: { type: Boolean, required: true },
    isVote: { type: Boolean, required: true },
    isReVote: { type: Boolean, required: true },
    isExtraSpeech: { type: Boolean, required: true },
    day: { type: Number, required: true },
    voted: { type: Object, required: true },
    proposed: [String],
    shoot: [String],
    wakeUp: [String] || String,
    killed: [String],
  },
});

export const Games = model<IGame>(DBSubject.Games, gamesSchema);
