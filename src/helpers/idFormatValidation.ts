import * as mongoose from 'mongoose'

export const idFormatValidation = (id: string): boolean =>
  mongoose.Types.ObjectId.isValid(id)
