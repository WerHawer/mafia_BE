import express from 'express';
import * as userController from '../subjects/users/usersController';

const router = express.Router();

router.route('/').post(userController.loginUser);

export default router;
