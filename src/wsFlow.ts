import { Server } from 'socket.io';
import * as gamesController from './subjects/games/gamesController';
import * as messagesService from './subjects/messages/messagesService';
import { dataNormalize } from './helpers/dataNormalize';
import { messagesPopulate } from './subjects/messages/messagesService';
import { livekitService } from './services/livekitService';
import { socketEventsGameFlow } from './socketFlows/socketEventsGameFlow';
import * as gamesService from './subjects/games/gamesService';
import { createGamesShortData } from './helpers/createGamesShortData';

export enum OffParams {
  Other = 'other',
  Self = 'self',
}

export enum wsEvents {
  connection = 'connection',
  participantDisconnect = 'participantDisconnect',
  roomConnection = 'roomConnection',
  roomLeave = 'roomLeave',
  messageSend = 'messageSend',
  disconnect = 'disconnect',
  socketDisconnect = 'socketDisconnect',
  gameUpdate = 'gameUpdate',
  gamesUpdate = 'gamesUpdate',
  userAudioStatus = 'userAudioStatus',
  userVideoStatus = 'userVideoStatus',
  userStreamStatus = 'userStreamStatus',
  startNight = 'startNight',
  startDay = 'startDay',
  updateSpeaker = 'updateSpeaker',
  wakeUp = 'wakeUp',
  livekitToken = 'livekitToken',
  addToProposed = 'addToProposed',
  vote = 'vote',
  shoot = 'shoot',
  toggleUserCamera = 'toggleUserCamera',
  toggleUserMicrophone = 'toggleUserMicrophone',
  userCameraStatusChanged = 'userCameraStatusChanged',
  userMicrophoneStatusChanged = 'userMicrophoneStatusChanged',
  batchToggleMicrophones = 'batchToggleMicrophones',
}

export const userSocketMap = new Map<string, string>();

export const wsFlow = (io: Server) => {
  const participantsMap = new Map<
    string,
    {
      roomId: string;
      useTo?: string[];
      user: {
        id: string;
        identity: string;
        audio: boolean;
        video: boolean;
        offParams?: OffParams;
      };
    }
  >();

  io.on(wsEvents.connection, async (socket) => {
    console.log(
      `SOCKET User connected! connected users: ${io.sockets.sockets.size}`
    );
    const userId = socket.handshake.auth.userId;

    if (userId) {
      userSocketMap.set(userId, socket.id);
    }

    io.emit(wsEvents.connection, {
      message: `connect success. Connected users: ${io.sockets.sockets.size}`,
      connectedUsers: io.sockets.sockets.size,
    });

    // Handle LiveKit token request
    socket.on(
      wsEvents.livekitToken,
      async ({ roomName, participantName, metadata }) => {
        try {
          // Create room if it doesn't exist
          await livekitService.createRoom(roomName);

          // Generate token
          const token = livekitService.generateAccessToken(
            roomName,
            participantName,
            metadata
          );

          socket.emit(wsEvents.livekitToken, {
            token,
            wsUrl: process.env.LIVEKIT_WS_URL || 'ws://localhost:7880',
            success: true,
          });
        } catch (error) {
          socket.emit(wsEvents.livekitToken, {
            error: error.message,
            success: false,
          });
        }
      }
    );

    socket.on(wsEvents.roomConnection, async ([roomId, userId]) => {
      socket.join(roomId);

      const game = await gamesService.getGame(roomId);
      const shortGame = createGamesShortData(game);

      io.emit(wsEvents.roomConnection, { userId, roomId, game: shortGame });

      console.log(`User ${userId} joined room ${roomId}`);
    });

    socket.on(wsEvents.roomLeave, async ([roomId, userId]) => {
      socket.leave(roomId);

      const game = await gamesService.getGame(roomId);
      const shortGame = createGamesShortData(game);

      io.emit(wsEvents.roomLeave, { userId, roomId, game: shortGame });

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

    socket.on(wsEvents.disconnect, async () => {
      // Clean up participant data
      for (const [participantIdentity, data] of participantsMap.entries()) {
        if (data.user.id === socket.id) {
          try {
            await livekitService.removeParticipant(
              data.roomId,
              participantIdentity
            );
          } catch (error) {
            console.error('Error removing participant on disconnect:', error);
          }
          participantsMap.delete(participantIdentity);

          io.to(data.roomId).emit(wsEvents.participantDisconnect, {
            participantIdentity,
            participants: [...participantsMap],
          });
        }
      }

      if (userId) {
        userSocketMap.delete(userId);
      }

      io.emit(wsEvents.socketDisconnect, io.sockets.sockets.size);

      console.log(
        'SOCKET User disconnected. connected users:',
        io.sockets.sockets.size
      );
    });

    socket.on(
      wsEvents.toggleUserCamera,
      async ({
        roomId,
        userId,
        participantIdentity,
        enabled,
        requesterId,
      }: {
        roomId: string;
        userId: string;
        participantIdentity: string;
        enabled: boolean;
        requesterId: string;
      }) => {
        console.log('params =====> ', {
          roomId,
          userId,
          participantIdentity,
          enabled,
          requesterId,
        });

        try {
          if (!roomId || !userId || !participantIdentity || !requesterId) {
            socket.emit('error', {
              message: 'Missing required parameters',
            });

            return;
          }

          const game = await gamesService.getGame(roomId);

          if (!game) {
            socket.emit('error', { message: 'Game not found' });

            return;
          }

          const isGM = game.gm === requesterId;
          const isSelf = requesterId === userId;

          if (!isSelf && !isGM) {
            socket.emit('error', {
              message:
                'Access denied: You do not have permission to control this user',
            });
            console.log(
              `Access denied: ${requesterId} tried to control camera of ${userId} (isGM: ${isGM}, isSelf: ${isSelf})`
            );
            return;
          }

          const shouldMute = !enabled;

          if (shouldMute) {
            await livekitService.muteParticipantTrackBySource(
              roomId,
              participantIdentity,
              'camera',
              true
            );
          } else {
            console.log(
              `[WS] Unmute request for camera - sending command to client ${participantIdentity}`
            );
          }

          io.to(roomId).emit(wsEvents.userCameraStatusChanged, {
            userId,
            participantIdentity,
            enabled,
            targetIdentity: participantIdentity,
          });

          console.log(
            `Camera ${enabled ? 'enabled' : 'disabled'} for user ${userId} (identity: ${participantIdentity}) in room ${roomId} by ${requesterId} (isGM: ${isGM})`
          );
        } catch (error) {
          console.error('Error toggling camera:', error);
          socket.emit('error', {
            message: 'Failed to toggle camera',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

    socket.on(
      wsEvents.toggleUserMicrophone,
      async ({
        roomId,
        userId,
        participantIdentity,
        enabled,
        requesterId,
      }: {
        roomId: string;
        userId: string;
        participantIdentity: string;
        enabled: boolean;
        requesterId: string;
      }) => {
        try {
          if (!roomId || !userId || !participantIdentity || !requesterId) {
            socket.emit('error', {
              message: 'Missing required parameters',
            });
            return;
          }

          const game = await gamesService.getGame(roomId);

          if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
          }

          const isGM = game.gm === requesterId;
          const isSelf = requesterId === userId;

          if (!isSelf && !isGM) {
            socket.emit('error', {
              message:
                'Access denied: You do not have permission to control this user',
            });
            console.log(
              `Access denied: ${requesterId} tried to control microphone of ${userId} (isGM: ${isGM}, isSelf: ${isSelf})`
            );
            return;
          }

          const shouldMute = !enabled;

          if (shouldMute) {
            await livekitService.muteParticipantTrackBySource(
              roomId,
              participantIdentity,
              'microphone',
              true
            );
          } else {
            console.log(
              `[WS] Unmute request for microphone - sending command to client ${participantIdentity}`
            );
          }

          io.to(roomId).emit(wsEvents.userMicrophoneStatusChanged, {
            userId,
            participantIdentity,
            enabled,
            targetIdentity: participantIdentity,
          });

          console.log(
            `Microphone ${enabled ? 'enabled' : 'disabled'} for user ${userId} (identity: ${participantIdentity}) in room ${roomId} by ${requesterId} (isGM: ${isGM})`
          );
        } catch (error) {
          console.error('Error toggling microphone:', error);
          socket.emit('error', {
            message: 'Failed to toggle microphone',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

    socket.on(
      wsEvents.batchToggleMicrophones,
      async ({
        roomId,
        enabled,
        targetUserIds,
        excludedUserIds,
        requesterId,
      }: {
        roomId: string;
        enabled: boolean;
        targetUserIds: string[];
        excludedUserIds: string[];
        requesterId: string;
      }) => {
        try {
          if (!roomId || !requesterId || !targetUserIds) {
            socket.emit('error', {
              message: 'Missing required parameters for batch operation',
            });
            return;
          }

          const game = await gamesService.getGame(roomId);

          if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
          }

          const isGM = game.gm === requesterId;

          if (!isGM) {
            socket.emit('error', {
              message: 'Access denied: Only GM can use batch controls',
            });
            console.log(
              `Access denied: ${requesterId} tried to use batch microphone control (isGM: ${isGM})`
            );
            return;
          }

          const usersToProcess = targetUserIds.filter(
            (userId) => !excludedUserIds.includes(userId)
          );

          console.log(
            `[Batch] Processing ${usersToProcess.length} users (excluded: ${excludedUserIds.length}) - ${enabled ? 'enabling' : 'disabling'} microphones`
          );

          const shouldMute = !enabled;

          if (shouldMute) {
            const results = await Promise.allSettled(
              usersToProcess.map(async (userId) => {
                try {
                  await livekitService.muteParticipantTrackBySource(
                    roomId,
                    userId,
                    'microphone',
                    true
                  );

                  io.to(roomId).emit(wsEvents.userMicrophoneStatusChanged, {
                    userId,
                    participantIdentity: userId,
                    enabled: false,
                    targetIdentity: userId,
                  });

                  return { userId, success: true };
                } catch (error) {
                  console.error(
                    `[Batch] Failed to mute microphone for user ${userId}:`,
                    error
                  );
                  return { userId, success: false, error };
                }
              })
            );

            const successful = results.filter(
              (r) => r.status === 'fulfilled' && r.value.success
            );
            console.log(
              `[Batch] Muted ${successful.length}/${usersToProcess.length} microphones`
            );
          } else {
            console.log(
              `[Batch] Unmute request - sending commands to ${usersToProcess.length} clients`
            );

            usersToProcess.forEach((userId) => {
              io.to(roomId).emit(wsEvents.userMicrophoneStatusChanged, {
                userId,
                participantIdentity: userId,
                enabled: true,
                targetIdentity: userId,
              });
            });

            console.log(
              `[Batch] Sent unmute commands to ${usersToProcess.length} users`
            );
          }

          socket.emit('batchOperationComplete', {
            operation: 'toggleMicrophones',
            enabled,
            processedCount: usersToProcess.length,
          });
        } catch (error) {
          console.error('Error in batch microphone toggle:', error);
          socket.emit('error', {
            message: 'Failed to perform batch microphone operation',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

    socketEventsGameFlow({ io, socket, participantsMap });
  });
};
