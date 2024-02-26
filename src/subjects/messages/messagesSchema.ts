import { model, Schema } from 'mongoose'
import { IMessage } from './messagesTypes'
import { DBSubject } from '../DBTypes'

const messagesSchema = new Schema<IMessage>({
  text: { type: String, required: true },
  sender: { type: String, required: true, ref: DBSubject.Users },
  to: {
    type: {
      type: String,
      required: true,
    },
    id: String,
  },
  date: Date,
  isRead: { type: Boolean, required: true },
})

export const Messages = model<IMessage>(DBSubject.Messages, messagesSchema)
