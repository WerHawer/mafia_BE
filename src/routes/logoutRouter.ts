import express from 'express';
import * as userController from '../subjects/users/usersController';
import { auth } from '../middlewares/auth';

const router = express.Router();

router.route('/').post(auth, userController.logoutUser);

export default router;
