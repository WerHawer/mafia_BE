import { model, Schema, Types } from 'mongoose'
import { IGame } from './gamesTypes'
import { DBSubject } from '../DBTypes'

const gamesSchema = new Schema<IGame>({
  name: { type: String, required: true },
  owner: { type: String, required: true },
  players: {
    type: [Types.ObjectId],
    ref: DBSubject.Users,
    required: true,
  },
  password: String,
  isPrivate: Boolean,
  isActive: { type: Boolean, required: true },
  description: String,
  img: String,
})

export const Games = model<IGame>(DBSubject.Games, gamesSchema)
