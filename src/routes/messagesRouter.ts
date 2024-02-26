import express from 'express'
import * as messagesController from '../subjects/messages/messagesController'

const router = express.Router()

router.post('/', messagesController.createMessage)

export default router
