import { Server } from 'socket.io';
import * as userService from './subjects/users/usersService';
import * as messagesService from './subjects/messages/messagesService';
import { dataNormalize } from './helpers/dataNormalize';
import { messagesPopulate } from './subjects/messages/messagesService';
import { PeerServerEvents } from 'peer';

export enum wsEvents {
  connection = 'connection',
  connectionError = 'connect_error',
  peerConnection = 'peerConnection',
  peerDisconnect = 'peerDisconnect',
  roomConnection = 'roomConnection',
  roomLeave = 'roomLeave',
  roomDisconnect = 'roomDisconnect',
  userConnectedCount = 'userConnectedCount',
  messagesGetAll = 'messagesGetAll',
  messagesGetRoom = 'messagesGetRoom',
  messageSend = 'messageSend',
  messageSendPrivate = 'messageSendPrivate',
  disconnect = 'disconnect',
  gameCreated = 'gameCreated',
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
    console.log(
      `SOCKET User connected! connected users: ${io.sockets.sockets.size}`
    );

    io.emit(
      wsEvents.connection,
      `connect success. Connected users: ${io.sockets.sockets.size}`
    );
    socket.broadcast.emit(wsEvents.userConnectedCount, io.sockets.sockets.size);

    socket.on(wsEvents.userConnectedCount, async () => {
      io.emit(wsEvents.userConnectedCount, io.sockets.sockets.size);
    });

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

    socket.on(wsEvents.roomLeave, async (roomId, userId) => {
      socket.leave(roomId);

      console.log(`User ${userId} left room ${roomId}`);
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

      console.log(
        'SOCKET User disconnected. connected users:',
        io.sockets.sockets.size
      );
    });
  });
};
