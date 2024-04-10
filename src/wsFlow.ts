import { Server } from 'socket.io';
import * as gamesController from './subjects/games/gamesController';
import * as messagesService from './subjects/messages/messagesService';
import { dataNormalize } from './helpers/dataNormalize';
import { messagesPopulate } from './subjects/messages/messagesService';
import { PeerServerEvents } from 'peer';

export enum wsEvents {
  connection = 'connection',
  peerDisconnect = 'peerDisconnect',
  roomConnection = 'roomConnection',
  roomLeave = 'roomLeave',
  messageSend = 'messageSend',
  disconnect = 'disconnect',
  socketDisconnect = 'socketDisconnect',
  gameUpdate = 'gameUpdate',
  gameFlowUpdate = 'gameFlowUpdate',
}

export const wsFlow = (io: Server, peerServer: PeerServerEvents) => {
  let activeConnections = 0;
  const streamsMap = new Map<string, Record<'roomId' | 'userId', string>>();

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
    streamsMap.delete(clientId);

    console.log(
      `PEER DISCONNECT id: ${clientId}. Total connections: ${activeConnections}`
    );

    io.to(roomId).emit(wsEvents.peerDisconnect, {
      streamId: clientId,
      streams: [...streamsMap],
    });

    const game = await gamesController.removeUserFromGameWithSocket(
      roomId,
      userId
    );

    io.emit(wsEvents.gameUpdate, dataNormalize(game));
  });

  io.on(wsEvents.connection, async (socket) => {
    console.log(
      `SOCKET User connected! connected users: ${io.sockets.sockets.size}`
    );

    io.emit(wsEvents.connection, {
      message: `connect success. Connected users: ${io.sockets.sockets.size}`,
      connectedUsers: io.sockets.sockets.size,
    });

    socket.on(wsEvents.roomConnection, async ([roomId, userId, streamId]) => {
      socket.join(roomId);
      streamsMap.set(streamId, { roomId, userId });
      io.to(roomId).emit(wsEvents.roomConnection, {
        streamId,
        streams: [...streamsMap],
      });

      console.log(`User ${userId} joined room ${roomId}`);
    });

    socket.on(wsEvents.roomLeave, async ([roomId, userId]) => {
      socket.leave(roomId);

      console.log(`User ${userId} left room ${roomId}`);
    });

    socket.on(wsEvents.messageSend, async (message) => {
      const savedMessage = await messagesService.createMessage(message);
      await savedMessage.populate(messagesPopulate);
      const event = wsEvents.messageSend;
      const data = dataNormalize(savedMessage);

      if (message.to.type === 'all') {
        io.emit(event, data);

        return;
      }

      io.to(message.to.id).emit(event, data);
    });

    socket.on(wsEvents.gameFlowUpdate, async (gameFlow) => {
      socket.to(gameFlow.id).emit(wsEvents.gameFlowUpdate, gameFlow);
    });

    socket.on(wsEvents.disconnect, () => {
      io.emit(wsEvents.socketDisconnect, io.sockets.sockets.size);

      console.log(
        'SOCKET User disconnected. connected users:',
        io.sockets.sockets.size
      );
    });
  });
};
