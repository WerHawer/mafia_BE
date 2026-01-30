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
router.patch('/:id/start', gamesController.startGame);
router.patch('/:id/startDay', gamesController.startDay);
router.patch('/:id/startNight', gamesController.startNight);
router.post('/:id/verify-password', gamesController.verifyGamePassword);
router.patch('/:id/addUser/:userId', gamesController.addUserToGame);
router.patch('/:id/removeUser/:userId', gamesController.removeUserFromGame);
router.patch('/:id/addToProposed', gamesController.addUserToProposed);
router.patch('/:id/vote', gamesController.addVote);
router.patch('/:id/shoot', gamesController.addShoot);

export default router;
