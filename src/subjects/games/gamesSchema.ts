import { model, Schema, Types } from 'mongoose';
import { IGame } from './gamesTypes';
import { DBSubject } from '../DBTypes';

const gamesSchema = new Schema<IGame>({
  owner: { type: String, ref: DBSubject.Users, required: true },
  players: {
    type: [Types.ObjectId],
    ref: DBSubject.Users,
    required: true,
  },
  password: String,
  isPrivate: Boolean,
  isActive: { type: Boolean, required: true },
  day: { type: Number, required: true },
  gm: { type: String, ref: DBSubject.Users, required: true },
  mafia: [Types.ObjectId],
  citizens: [Types.ObjectId],
  cherif: Types.ObjectId || null,
  doctor: Types.ObjectId || null,
  maniac: Types.ObjectId || null,
  prostitute: Types.ObjectId || null,
  killed: [Types.ObjectId],
  startTime: Number || null,
  finishTime: Number || null,
  creatingTime: { type: Number, required: true },
  gameType: { type: String, required: true },
});

export const Games = model<IGame>(DBSubject.Games, gamesSchema);
