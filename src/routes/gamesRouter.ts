import express from 'express'
import * as gamesController from '../subjects/games/gamesController'

const router = express.Router()

router.get('/', gamesController.getAllGames)
router.get('/:id', gamesController.getGame)
router.post('/', gamesController.createGame)
router.patch('/:id', gamesController.updateGame)
router.patch('/:id/addUser/:userId', gamesController.addUserToGame)

export default router
