import express from 'express';
import * as userController from '../subjects/users/usersController';

const router = express.Router();

router.route('/').post(userController.createUser);

export default router;
