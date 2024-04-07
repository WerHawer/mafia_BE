import express from 'express';
import * as messagesController from '../subjects/messages/messagesController';

const router = express.Router();

router.get('/', messagesController.getAllMessages);
router.get('/private/:id', messagesController.getPrivateMessages);
router.get('/room/:id', messagesController.getRoomMessages);

export default router;
