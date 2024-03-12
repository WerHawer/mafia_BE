import { Server } from 'socket.io';
import * as userService from './subjects/users/usersService';
import * as messagesService from './subjects/messages/messagesService';
import { dataNormalize } from './helpers/dataNormalize';
import { messagesPopulate } from './subjects/messages/messagesService';
import { PeerServerEvents } from 'peer';

enum wsEvents {
  connection = 'connection',
  connectionError = 'connect_error',
  peerConnection = 'peerConnection',
  peerDisconnect = 'peerDisconnect',
  roomConnection = 'roomConnection',
  roomDisconnect = 'roomDisconnect',
  userConnectedCount = 'userConnectedCount',
  messagesGetAll = 'messagesGetAll',
  messagesGetRoom = 'messagesGetRoom',
  messageSend = 'messageSend',
  messageSendPrivate = 'messageSendPrivate',
  disconnect = 'disconnect',
}

const streamsMap = new Map<string, string>();

export const wsFlow = (io: Server, peerServer: PeerServerEvents) => {
  let activeConnections = 0;

  peerServer.on(wsEvents.connection, (client) => {
    activeConnections += 1;
    console.log(
      `PEER CONNECT id: ${client.getId()}. Total connections: ${activeConnections}`
    );
  });

  peerServer.on(wsEvents.disconnect, (client) => {
    activeConnections -= 1;
    const clientId = client.getId();
    const roomId = streamsMap.get(clientId);

    console.log(
      `PEER DISCONNECT id: ${clientId}. Total connections: ${activeConnections}`
    );

    io.to(roomId).emit(wsEvents.peerDisconnect, clientId);
  });

  io.on(wsEvents.connection, async (socket) => {
    const userId = socket.handshake.query.user as string;
    const user = await userService.getUserById(userId);

    if (!user) {
      socket.disconnect(true);
      socket.emit(wsEvents.connectionError, 'User not found');

      console.log('User not found');

      return;
    }

    io.emit(wsEvents.connection, `${user.name} connected successfully`);
    io.emit(wsEvents.userConnectedCount, io.sockets.sockets.size);

    console.log(`SOCKET User connected! Hi ${user.name}`);

    socket.on(wsEvents.roomConnection, async (roomId, userId, streamId) => {
      const roomMessages = await messagesService.getRoomMessages(roomId);

      socket.join(roomId);

      if (streamId) {
        streamsMap.set(streamId, roomId);
      }

      socket.to(roomId).emit(wsEvents.roomConnection, userId);

      io.to(roomId).emit(wsEvents.messagesGetRoom, dataNormalize(roomMessages));

      console.log(`User ${userId} joined room ${roomId}`);
    });

    socket.on(wsEvents.messagesGetAll, async () => {
      const allMessages = await (async () => {
        const messages = await messagesService.getAllPublicMessages();
        return dataNormalize(messages);
      })();

      socket.emit(wsEvents.messagesGetAll, allMessages);
    });

    socket.on(wsEvents.messageSend, async (message) => {
      const savedMessage = await messagesService.createMessage(message);
      await savedMessage.populate(messagesPopulate);

      socket.broadcast.emit(wsEvents.messageSend, dataNormalize(savedMessage));
    });

    socket.on(wsEvents.messageSendPrivate, async (message) => {
      const savedMessage = await messagesService.createMessage(message);
      await savedMessage.populate(messagesPopulate);

      socket
        .to(message.to.id)
        .emit(wsEvents.messageSendPrivate, dataNormalize(savedMessage));
    });

    socket.on(wsEvents.disconnect, () => {
      io.emit(wsEvents.userConnectedCount, io.sockets.sockets.size);

      console.log('SOCKET User disconnected');
    });
  });
};
