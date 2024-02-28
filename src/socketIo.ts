import { Server } from 'socket.io';
import * as userService from './subjects/users/usersService';
import * as messagesService from './subjects/messages/messagesService';
import { dataNormalize } from './helpers/dataNormalize';
import { messagesPopulate } from './subjects/messages/messagesService';

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
      const roomMessages = await messagesService.getRoomMessages(roomId);

      socket.join(roomId);
      socket.to(roomId).emit('userConnectedToRoom', userId);
      io.to(roomId).emit('getRoomMessages', dataNormalize(roomMessages));

      socket.on('userDisconnectedFromRoom', (streamId) => {
        io.to(roomId).emit('userDisconnectedFromRoom', streamId);
        console.log(`Stream ${streamId} left room ${roomId}`);
      });

      console.log(`User ${userId} joined room ${roomId}`);
    });

    io.emit('connectMessage', io.sockets.sockets.size);

    const allMessages = await (async () => {
      const messages = await messagesService.getAllPublicMessages();
      return dataNormalize(messages);
    })();

    socket.emit('getAllMessages', allMessages);

    socket.on('chatMessage', async (message) => {
      const savedMessage = await messagesService.createMessage(message);
      await savedMessage.populate(messagesPopulate);

      socket.broadcast.emit('chatMessage', dataNormalize(savedMessage));
    });

    socket.on('roomMessage', async (message) => {
      const savedMessage = await messagesService.createMessage(message);
      await savedMessage.populate(messagesPopulate);

      socket.to(message.to.id).emit('roomMessage', dataNormalize(savedMessage));
    });

    socket.on('disconnect', () => {
      io.emit('connectMessage', io.sockets.sockets.size);
      console.log('socket User disconnected');
    });
  });
};
