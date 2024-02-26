import { Games } from './gamesSchema'
import { IGame } from './gamesTypes'
import { Populate } from '../DBTypes'

export const getGames = async () =>
  Games.find({}, undefined, { populate: Populate.Players })

export const getGame = async (id: string) =>
  Games.findById(id, undefined, { populate: Populate.Players })

export const createGame = async (game: IGame) => Games.create(game)

export const updateGame = async (id: string, game: Partial<IGame>) =>
  Games.findByIdAndUpdate(id, game, {
    new: true,
    populate: Populate.Players,
  })
