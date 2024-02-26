import { IUser } from '../users/usersTypes'

export interface IGame {
  name: string
  owner: string
  players: string[]
  password?: string
  isPrivate: boolean
  isActive: boolean
  description?: string
  img?: string
}

export interface IGameDTO extends Omit<IGame, 'players'> {
  players: IUser[]
}
