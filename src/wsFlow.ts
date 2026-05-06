import { Server } from 'socket.io';
import * as messagesService from './subjects/messages/messagesService';
import { dataNormalize } from './helpers/dataNormalize';
import { messagesPopulate } from './subjects/messages/messagesService';
import { livekitService } from './services/livekitService';
import { socketEventsGameFlow } from './socketFlows/socketEventsGameFlow';
import * as gamesService from './subjects/games/gamesService';
import { createGamesShortData } from './helpers/createGamesShortData';
import * as usersService from './subjects/users/usersService';
import { getUserById } from './subjects/users/usersService';

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
  messagesUpdate = 'messagesUpdate',
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
  batchToggleCameras = 'batchToggleCameras',
  batchMicrophonesStatusChanged = 'batchMicrophonesStatusChanged',
  batchCamerasStatusChanged = 'batchCamerasStatusChanged',
  playerSleepConfirm = 'playerSleepConfirm',
  playerSleepAck = 'playerSleepAck',
  playerWakeConfirm = 'playerWakeConfirm',
  playerWakeAck = 'playerWakeAck',
  manualSleep = 'manualSleep',
  manualWake = 'manualWake',
  peerDisconnect = 'peerDisconnect',
  gameReaction = 'gameReaction',
  healthCheck = 'healthCheck',
  gameNotFound = 'gameNotFound',
  gmChanged = 'gmChanged',
  setObserverMode = 'setObserverMode',
  voteTimerExpired = 'voteTimerExpired',
  // Emitted to a specific socket when we detect it has reconnected after a brief
  // disconnect. The FE should respond by re-checking and re-publishing its LiveKit
  // video/audio tracks, since the WebRTC session may have silently died while the
  // Socket.io TCP connection was recovering.
  videoRepublishRequired = 'videoRepublishRequired',
}

export const userSocketMap = new Map<string, string>();

// Tracks pending "remove from game" timers per userId for graceful reconnect support
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Tracks pending "deactivate empty game" timers per gameId
const emptyGameTimers = new Map<string, ReturnType<typeof setTimeout>>();

// How long to wait before treating a disconnected player as permanently gone.
const GRACEFUL_RECONNECT_TIMEOUT_MS = 30_000;

// How long to wait before deactivating an empty game (1 minute)
const EMPTY_GAME_DEACTIVATION_MS = 60_000;

/**
 * Get a list of all currently online users (with names and avatars)
 */
const getOnlineUsers = async () => {
  const onlineUserIds = Array.from(userSocketMap.keys());
  if (onlineUserIds.length === 0) return [];
  
  const users = await usersService.getUsersByIds(onlineUserIds);
  return users.map(u => dataNormalize(u));
};

// Start a 1-minute countdown to deactivate an empty game.
// Can be cancelled if a player rejoins before it fires.
export const scheduleEmptyGameDeactivation = (gameId: string, io: Server): void => {
  // Cancel any existing timer for this game first
  cancelEmptyGameDeactivation(gameId);

  console.log(`[EmptyGame] Scheduling deactivation of game ${gameId} in ${EMPTY_GAME_DEACTIVATION_MS / 1000}s`);

  const timer = setTimeout(async () => {
    emptyGameTimers.delete(gameId);
    try {
      const updatedGame = await gamesService.updateGame(gameId, { isActive: false });
      if (!updatedGame) return;
      // Broadcast to ALL clients so home-page list removes this game
      io.emit(wsEvents.gamesUpdate, createGamesShortData(updatedGame));
      console.log(`[EmptyGame] Game ${gameId} deactivated after ${EMPTY_GAME_DEACTIVATION_MS / 1000}s with 0 players`);
    } catch (err) {
      console.error(`[EmptyGame] Failed to deactivate game ${gameId}:`, err);
    }
  }, EMPTY_GAME_DEACTIVATION_MS);

  emptyGameTimers.set(gameId, timer);
};

export const cancelEmptyGameDeactivation = (gameId: string): void => {
  const existing = emptyGameTimers.get(gameId);
  if (existing) {
    clearTimeout(existing);
    emptyGameTimers.delete(gameId);
    console.log(`[EmptyGame] Cancelled deactivation timer for game ${gameId} — player rejoined`);
  }
};

// Tracks pending "restart after GM left during active game" timers per gameId
const gmLeftTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Pick next GM from remaining players and update the game.
 * Returns the updated game or null if no one left.
 */
const assignNextGM = async (gameId: string, remainingPlayers: string[]) => {
  if (remainingPlayers.length === 0) return null;
  const newGM = remainingPlayers[0];
  const updated = await gamesService.updateGame(gameId, { gm: newGM });
  return updated;
};

/**
 * Handle GM leaving the game:
 * - If game not started: assign next GM immediately.
 * - If game was active: wait 1 min, restart, assign next GM.
 */
export const handleGMLeave = (
  gameId: string,
  leavingGMId: string,
  remainingPlayers: string[],
  wasStarted: boolean,
  io: Server
): void => {
  if (remainingPlayers.length === 0) return; // no one to become GM

  if (!wasStarted) {
    // Immediate GM reassignment before game starts
    assignNextGM(gameId, remainingPlayers).then((updatedGame) => {
      if (!updatedGame) return;
      io.to(gameId).emit(wsEvents.gameUpdate, dataNormalize(updatedGame));
      io.to(gameId).emit(wsEvents.gmChanged, {
        newGMId: updatedGame.gm,
        reason: 'left_before_start',
      });
      console.log(`[GM] Game ${gameId}: new GM assigned to ${updatedGame.gm} (before start)`);
    }).catch((err) => console.error(`[GM] Failed to assign new GM for game ${gameId}:`, err));
    return;
  }

  // Cancel any existing timer for this game
  const existingTimer = gmLeftTimers.get(gameId);
  if (existingTimer) clearTimeout(existingTimer);

  console.log(`[GM] Game ${gameId}: GM left during active game — restarting in 60s`);

  // Notify players immediately that GM left
  io.to(gameId).emit(wsEvents.gmChanged, {
    newGMId: null,
    reason: 'left_during_game',
    restartsIn: 60,
  });

  const timer = setTimeout(async () => {
    gmLeftTimers.delete(gameId);
    try {
      const restartedGame = await gamesService.restartGame(gameId);
      if (!restartedGame) return;

      // Get fresh player list after restart
      const freshPlayers = restartedGame.players.filter((p: string) => p !== leavingGMId);
      if (freshPlayers.length === 0) return;

      const updatedGame = await assignNextGM(gameId, freshPlayers);
      if (!updatedGame) return;

      io.to(gameId).emit(wsEvents.gameUpdate, dataNormalize(updatedGame));
      io.emit(wsEvents.gamesUpdate, createGamesShortData(updatedGame));
      io.to(gameId).emit(wsEvents.gmChanged, {
        newGMId: updatedGame.gm,
        reason: 'restarted_after_gm_left',
      });
      console.log(`[GM] Game ${gameId} restarted. New GM: ${updatedGame.gm}`);
    } catch (err) {
      console.error(`[GM] Failed to restart game after GM left (game ${gameId}):`, err);
    }
  }, EMPTY_GAME_DEACTIVATION_MS);

  gmLeftTimers.set(gameId, timer);
};

const handlePlayerDisconnectTimeout = async (
  userId: string,
  io: Server
): Promise<void> => {
  try {
    // Safety check: if the user reconnected before the timer fired, abort removal.
    // This prevents a race condition where the timer fires just after a new connection arrives.
    if (userSocketMap.has(userId)) {
      console.log(
        `[Disconnect] User ${userId} already reconnected — skipping game removal`
      );
      return;
    }

    await usersService.setUserOnlineStatus(userId, false);

    const game = await gamesService.findGameByPlayerId(userId);

    if (!game) {
      console.log(`[Disconnect] User ${userId} was not in any active game`);
      return;
    }

    const gameId = game._id.toString();
    const wasGM = game.gm?.toString() === userId;
    const wasStarted: boolean = game.gameFlow?.isStarted ?? false;

    let updatedGame = await gamesService.removeGamePlayers(gameId, userId);

    if (!updatedGame) {
      console.error(
        `[Disconnect] Failed to remove user ${userId} from game ${gameId}`
      );
      return;
    }

    // Handle GM leaving
    if (wasGM && updatedGame.players.length > 0) {
      handleGMLeave(gameId, userId, [...updatedGame.players], wasStarted, io);
    }

    // Immediately restart the game when the last player leaves so it's joinable again
    if (updatedGame.players.length === 0) {
      try {
        const restartedGame = await gamesService.restartGame(gameId);
        if (restartedGame) {
          updatedGame = restartedGame;
          io.emit(wsEvents.gamesUpdate, createGamesShortData(restartedGame));
          console.log(`[Disconnect] Game ${gameId} auto-restarted immediately after last player left`);
        }
      } catch (err) {
        console.error(`[Disconnect] Failed to auto-restart game ${gameId}:`, err);
      }
      // Schedule deactivation if no one joins within 1 minute
      scheduleEmptyGameDeactivation(gameId, io);
    }

    io.to(gameId).emit(wsEvents.gameUpdate, dataNormalize(updatedGame));

    // Notify all clients that the player has left the room so the FE
    // can update the participant list without requiring a manual page refresh.
    io.emit(wsEvents.roomLeave, {
      userId,
      roomId: gameId,
      game: createGamesShortData(updatedGame),
    });

    console.log(
      `[Disconnect] Removed user ${userId} from game ${gameId} after ${GRACEFUL_RECONNECT_TIMEOUT_MS / 1000}s graceful timeout`
    );
  } catch (error) {
    console.error(
      `[Disconnect] Error handling disconnect for user ${userId}:`,
      error
    );
  }
};

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
    const userId = socket.handshake.auth.userId as string | undefined;

    if (userId) {
      userSocketMap.set(userId, socket.id);
      socket.data.userId = userId;

      // Cancel any pending "remove from game" timer from a previous disconnect
      const pendingTimer = disconnectTimers.get(userId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        disconnectTimers.delete(userId);
        console.log(
          `[Reconnect] Cancelled pending disconnect timer for user ${userId}`
        );
        // The Socket.io session recovered within the grace period.
        // The LiveKit WebRTC session (UDP) may have silently died while the
        // TCP connection was restoring — signal the client to re-publish its tracks.
        socket.emit(wsEvents.videoRepublishRequired, { reason: 'socket_reconnect' });
        console.log(`[Reconnect] Emitted videoRepublishRequired to user ${userId}`);
      }

      // Mark user as online again in case the timer had already fired
      await usersService.setUserOnlineStatus(userId, true).catch((error) => {
        console.error(`[Connect] Failed to set user ${userId} online:`, error);
      });
    }

    const onlineUsers = await getOnlineUsers();

    io.emit(wsEvents.connection, {
      message: `connect success. Connected users: ${io.sockets.sockets.size}`,
      connectedUsers: io.sockets.sockets.size,
      onlineUsers,
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

    socket.on(wsEvents.healthCheck, (data, callback) => {
      const { gameId, userId, videoIssue } = data || {};
      if (gameId && userId) {
        if (!socket.rooms.has(gameId)) {
          console.log(`[HealthCheck] User ${userId} was not in room ${gameId}. Force joining.`);
          socket.join(gameId);
        }
      }
      if (typeof callback === 'function') {
        // If FE reports a video issue, acknowledge it and tell it to republish
        callback({ ok: true, shouldRepublishVideo: !!videoIssue });
      }
      // Also emit the event directly so FE can handle it without a callback
      if (videoIssue) {
        socket.emit(wsEvents.videoRepublishRequired, { reason: 'health_check_reported' });
      }
    });

    socket.on(wsEvents.roomConnection, async ([roomId, userId]) => {
      socket.join(roomId);

      // Dead chat rooms use a composite id (gameId_dead) — skip game lookup
      if (roomId.endsWith('_dead')) {
        console.log(`User ${userId} joined dead room ${roomId}`);
        return;
      }

      const game = await gamesService.getGame(roomId);

      if (!game) {
        console.log(`[WS] User ${userId} tried to join non-existent room ${roomId}.`);
        socket.emit(wsEvents.gameNotFound, { roomId });
        return;
      }

      // Cancel empty-game deactivation timer if someone is joining
      cancelEmptyGameDeactivation(roomId);

      const shortGame = createGamesShortData(game);

      // The HTTP call to add the player may not have completed yet —
      // ensure the joining player is reflected in the count regardless.
      const players = (game?.players as string[]) ?? [];
      const alreadyInGame = players.some(
        (p: string) => p.toString() === userId
      );
      if (!alreadyInGame) {
        shortGame.playersCount = players.length + 1;
      }

      io.emit(wsEvents.roomConnection, { userId, roomId, game: shortGame });

      console.log(`User ${userId} joined room ${roomId}`);
    });

    socket.on(wsEvents.roomLeave, async ([roomId, userId]) => {
      socket.leave(roomId);

      // Dead chat rooms use a composite id (gameId_dead) — skip game lookup
      if (roomId.endsWith('_dead')) {
        console.log(`User ${userId} left dead room ${roomId}`);
        return;
      }

      const game = await gamesService.getGame(roomId);

      if (!game) {
        return;
      }

      const shortGame = createGamesShortData(game);

      // The HTTP call to remove the player may not have completed yet —
      // ensure the leaving player is excluded from the count regardless.
      const players = (game?.players as string[]) ?? [];
      const stillInGame = players.some((p: string) => p.toString() === userId);
      if (stillInGame) {
        shortGame.playersCount = Math.max(0, players.length - 1);
      }

      io.emit(wsEvents.roomLeave, { userId, roomId, game: shortGame });

      console.log(`User ${userId} left room ${roomId}`);
    });

    socket.on(wsEvents.messageSend, async (message) => {
      if (!message?.to) {
        console.error(
          '[Chat Error] Invalid message format - missing "to" property'
        );
        return;
      }

      if (!message.to.type) {
        console.error(
          '[Chat Error] Invalid message format - missing "to.type" property'
        );
        return;
      }

      // For public chat (type === 'all'), we don't need to.id
      if (message.to.type === 'all') {
        const savedMessage = await messagesService.createMessage(message);
        await savedMessage.populate(messagesPopulate);
        const event = wsEvents.messageSend;
        const data = dataNormalize(savedMessage);

        io.emit(event, data);
        return;
      }

      // For room-based chats, we need to.id
      if (!message.to.id) {
        console.error(
          '[Chat Error] Invalid message format - missing "to.id" property for room-based chat'
        );
        return;
      }

      const isDeadChat = message.to.id.endsWith('_dead');

      if (isDeadChat) {
        const roomId = message.to.id.replace('_dead', '');
        const game = await gamesService.getGame(roomId);

        const isKilled = game?.gameFlow?.killed?.includes(message.sender);
        const isGM = game?.gm === message.sender;

        if (!isKilled && !isGM) {
          console.log(
            `[Chat Block] User ${message.sender} tried to post in dead chat ${message.to.id} but is not dead or GM.`
          );
          return;
        }
      }

      const savedMessage = await messagesService.createMessage(message);
      await savedMessage.populate(messagesPopulate);
      const event = wsEvents.messageSend;
      const data = dataNormalize(savedMessage);

      io.to(message.to.id).emit(event, data);
    });

    socket.on(wsEvents.disconnect, async (reason) => {
      // Clean up LiveKit participant data
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

      // socket.data.userId is the primary source; fall back to handshake auth
      // in case socket.data was not populated (e.g. connection handler error)
      const disconnectedUserId =
        (socket.data.userId as string | undefined) ??
        (socket.handshake.auth.userId as string | undefined);

      console.log(
        `[Disconnect] Socket ${socket.id} disconnected. Reason: ${reason}. UserId: ${disconnectedUserId ?? 'unknown'}`
      );

      if (disconnectedUserId) {
        userSocketMap.delete(disconnectedUserId);

        // Start a grace period before removing the player from the game.
        // This allows players who briefly lose connectivity to rejoin without losing their spot.
        const timer = setTimeout(() => {
          disconnectTimers.delete(disconnectedUserId);
          handlePlayerDisconnectTimeout(disconnectedUserId, io);
        }, GRACEFUL_RECONNECT_TIMEOUT_MS);

        disconnectTimers.set(disconnectedUserId, timer);

        console.log(
          `[Disconnect] Started ${GRACEFUL_RECONNECT_TIMEOUT_MS / 1000}s grace timer for user ${disconnectedUserId}`
        );
      } else {
        console.warn(
          `[Disconnect] Socket ${socket.id} disconnected without a userId — game cleanup skipped`
        );
      }

      // Emit updated connected-user count immediately — socket count is already decremented
      getOnlineUsers().then(onlineUsers => {
        io.emit(wsEvents.socketDisconnect, {
          connectedUsers: io.sockets.sockets.size,
          onlineUsers,
        });
      });

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

          // NOTE: We do NOT call livekitService.muteParticipantTrackBySource() here.
          // LiveKit Server SDK can only mute (not unmute) remotely, which causes
          // the SFU to block the video stream permanently even after unmute commands.
          // Instead, we rely entirely on client-side muting via the WS event below.
          if (shouldMute) {
            console.log(`[WS] Mute camera request for ${participantIdentity} — client will handle`);
          } else {
            console.log(`[WS] Unmute camera request for ${participantIdentity} — client will handle`);
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
        forceMute,
      }: {
        roomId: string;
        userId: string;
        participantIdentity: string;
        enabled: boolean;
        requesterId: string;
        forceMute?: boolean;
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

          // NOTE: We do NOT call livekitService.muteParticipantTrackBySource() here.
          // LiveKit Server SDK can only mute (not unmute) remotely, which causes
          // the SFU to block the audio stream permanently even after unmute commands.
          // Instead, we rely entirely on client-side muting via the WS event below.
          if (shouldMute) {
            console.log(`[WS] Mute microphone request for ${participantIdentity} — client will handle`);
          } else {
            console.log(`[WS] Unmute microphone request for ${participantIdentity} — client will handle`);
          }

          io.to(roomId).emit(wsEvents.userMicrophoneStatusChanged, {
            userId,
            participantIdentity,
            enabled,
            targetIdentity: participantIdentity,
            forceMute,
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

          // Instead of sending N individual messages, send one batch message
          io.to(roomId).emit(wsEvents.batchMicrophonesStatusChanged, {
            userIds: usersToProcess,
            enabled,
          });

          console.log(
            `[Batch] Sent ${enabled ? 'unmute' : 'mute'} commands to ${usersToProcess.length} microphones`
          );

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

    socket.on(
      wsEvents.batchToggleCameras,
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
              `Access denied: ${requesterId} tried to use batch camera control (isGM: ${isGM})`
            );
            return;
          }

          const usersToProcess = targetUserIds.filter(
            (userId) => !excludedUserIds.includes(userId)
          );

          console.log(
            `[Batch] Processing ${usersToProcess.length} users (excluded: ${excludedUserIds.length}) - ${enabled ? 'enabling' : 'disabling'} cameras`
          );

          // Instead of sending N individual messages, send one batch message
          io.to(roomId).emit(wsEvents.batchCamerasStatusChanged, {
            userIds: usersToProcess,
            enabled,
          });

          console.log(
            `[Batch] Sent ${enabled ? 'unmute' : 'mute'} commands to ${usersToProcess.length} cameras`
          );

          socket.emit('batchOperationComplete', {
            operation: 'toggleCameras',
            enabled,
            processedCount: usersToProcess.length,
          });
        } catch (error) {
          console.error('Error in batch camera toggle:', error);
          socket.emit('error', {
            message: 'Failed to perform batch camera operation',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

    socket.on(
      wsEvents.setObserverMode,
      async ({ gameId, userId }: { gameId: string; userId: string }) => {
        try {
          const updatedGame = await gamesService.setObserverMode(gameId, userId);
          if (updatedGame) {
            io.to(gameId).emit(wsEvents.gameUpdate, dataNormalize(updatedGame));
            console.log(`[GhostMode] User ${userId} became an observer in game ${gameId}`);
          }
        } catch (error) {
          console.error(`[GhostMode] Error setting observer mode for user ${userId}:`, error);
        }
      }
    );

    socket.on(
      wsEvents.gameReaction,
      async ({
        gameId,
        userId,
        emoji,
      }: {
        gameId: string;
        userId: string;
        emoji: string;
      }) => {
        let userName = userId;

        try {
          const user = await usersService.getUserById(userId);
          if (user?.nikName) userName = user.nikName;
        } catch {
          // fall back to userId
        }

        const game = await gamesService.getGame(gameId);
        const isObserver = game?.observers?.includes(userId);

        if (isObserver) {
          // Ghost reactions are visible only to dead players and the GM (who is also in the dead room)
          io.to(`${gameId}_dead`).emit(wsEvents.gameReaction, { userId, userName, emoji });
        } else {
          io.to(gameId).emit(wsEvents.gameReaction, { userId, userName, emoji });
        }
      }
    );

    socketEventsGameFlow({ io, socket, participantsMap });
  });
};
