import express from 'express';
import * as gamesController from '../subjects/games/gamesController';

const router = express.Router();

router.get('/', gamesController.getGames);
router.get('/:id', gamesController.getGame);
router.post('/', gamesController.createGame);
router.patch('/:id', gamesController.updateGame);
router.patch('/:id/updateGM', gamesController.updateGame);
router.patch('/:id/updateFlow', gamesController.updateGame);
router.patch('/:id/addRoles', gamesController.addRolesToGame);
router.patch('/:id/restart', gamesController.restartGame);
router.patch('/:id/addUser/:userId', gamesController.addUserToGame);
router.patch('/:id/removeUser/:userId', gamesController.removeUserFromGame);

export default router;
