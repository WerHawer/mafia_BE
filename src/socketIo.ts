import { Server } from 'socket.io';
import * as userService from './subjects/users/usersService';
import * as messagesService from './subjects/messages/messagesService';

export const connectSocket = (io: Server) => {
  io.on('connection', async (socket) => {
    const userId = socket.handshake.query.user as string;

    const user = await userService.getUserById(userId);

    if (!user) {
      socket.disconnect(true);
      socket.emit('connection_error', 'User not found');

      console.log('User not found');
    }

    console.log(`User connected! Hi ${user.name}`);

    socket.on('joinRoom', async (roomId, userId) => {
      socket.join(roomId);
      socket.to(roomId).emit('userConnectedToRoom', userId);
      io.to(roomId).emit(
        'getRoomMessages',
        await messagesService.getRoomMessages(roomId)
      );

      socket.on('userDisconnectedFromRoom', (streamId) => {
        io.to(roomId).emit('userDisconnectedFromRoom', streamId);
        console.log(`Stream ${streamId} left room ${roomId}`);
      });

      console.log(`User ${userId} joined room ${roomId}`);
    });

    io.emit('connectMessage', io.sockets.sockets.size);

    socket.emit('getAllMessages', await messagesService.getAllPublicMessages());

    socket.on('chatMessage', async (message) => {
      const savedMessage = await messagesService.createMessage(message);
      await savedMessage.populate('sender');

      socket.broadcast.emit('chatMessage', savedMessage);
    });

    socket.on('roomMessage', async (message) => {
      const savedMessage = await messagesService.createMessage(message);
      await savedMessage.populate('sender');

      socket.to(message.to.id).emit('roomMessage', savedMessage);
    });

    socket.on('disconnect', () => {
      io.emit('connectMessage', io.sockets.sockets.size);
      console.log('socket User disconnected');
    });
  });
};
