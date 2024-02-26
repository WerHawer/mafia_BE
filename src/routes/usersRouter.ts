import express from 'express'
import * as userController from '../subjects/users/usersController'
import { upload } from '../storage'

const router = express.Router()

router.route('/').get(userController.getAllUsers)
router.route('/').post(userController.createUser)
router.route('/:id').get(userController.getUserById)
router.route('/:id').patch(userController.updateUser)
router.route('/:id').delete(userController.deleteUser)
router
  .route('/:id/avatar')
  .patch(upload.single('avatar'), userController.updateUserAvatar)
router.route('/:id/avatar/:avatarId').delete(userController.deleteUserAvatar)

export default router
