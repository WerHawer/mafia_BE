import { Server } from 'socket.io';
import * as gamesService from './subjects/games/gamesService';
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
  userConnectedCount = 'userConnectedCount',
  messagesGetRoom = 'messagesGetRoom',
  messageSend = 'messageSend',
  messageSendPrivate = 'messageSendPrivate',
  disconnect = 'disconnect',
  updateGame = 'updateGame',
}

const streamsMap = new Map<string, Record<'roomId' | 'userId', string>>();

export const wsFlow = (io: Server, peerServer: PeerServerEvents) => {
  let activeConnections = 0;

  peerServer.on(wsEvents.connection, (client) => {
    activeConnections += 1;
    console.log(
      `PEER CONNECT id: ${client.getId()}. Total connections: ${activeConnections}`
    );
  });

  peerServer.on(wsEvents.disconnect, async (client) => {
    activeConnections -= 1;
    const clientId = client.getId();
    const { roomId, userId } = streamsMap.get(clientId);

    console.log(
      `PEER DISCONNECT id: ${clientId}. Total connections: ${activeConnections}`
    );

    io.to(roomId).emit(wsEvents.peerDisconnect, clientId);

    const game = await gamesService.removeGamePlayers(roomId, userId);
    io.emit(wsEvents.updateGame, dataNormalize(game));
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

    socket.on(wsEvents.roomConnection, async ([roomId, userId, streamId]) => {
      socket.join(roomId);

      streamsMap.set(streamId, { roomId, userId });

      socket.to(roomId).emit(wsEvents.roomConnection, streamId);

      const roomMessages = await messagesService.getRoomMessages(roomId);
      io.to(roomId).emit(wsEvents.messagesGetRoom, dataNormalize(roomMessages));

      console.log(`User ${userId} joined room ${roomId}`);
    });

    socket.on(wsEvents.roomLeave, async ([roomId, userId]) => {
      socket.leave(roomId);

      console.log(`User ${userId} left room ${roomId}`);
    });

    socket.on(wsEvents.messageSend, async (message) => {
      const savedMessage = await messagesService.createMessage(message);
      await savedMessage.populate(messagesPopulate);

      io.emit(wsEvents.messageSend, dataNormalize(savedMessage));
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
