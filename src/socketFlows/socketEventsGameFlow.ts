import { OffParams, wsEvents } from '../wsFlow';
import * as gamesService from '../subjects/games/gamesService';
import { dataNormalize } from '../helpers/dataNormalize';

const SLEEP_CONFIRM_TIMEOUT_MS = 1500;

// Map<gameId, Map<userId, ReturnType<typeof setTimeout>>>
// Tracks pending retry timers per player per game
const retryTimers = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();

const cancelRetryTimer = (gameId: string, userId: string) => {
  const gameTimers = retryTimers.get(gameId);
  if (gameTimers) {
    const timer = gameTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      gameTimers.delete(userId);
    }
  }
};

export const socketEventsGameFlow = ({ io, socket, participantsMap }) => {
  socket.on(
    wsEvents.userVideoStatus,
    ({ participantIdentity, roomId, video, offParams }) => {
      const participant = participantsMap.get(participantIdentity);
      if (participant) {
        participant.user.video = video;
        participant.user.offParams = offParams;

        io.to(roomId).emit(wsEvents.userStreamStatus, [...participantsMap]);
      }
    }
  );

  socket.on(
    wsEvents.userAudioStatus,
    ({ participantIdentity, roomId, audio, offParams }) => {
      const participant = participantsMap.get(participantIdentity);
      if (participant) {
        participant.user.audio = audio;
        participant.user.offParams = offParams;

        io.to(roomId).emit(wsEvents.userStreamStatus, [...participantsMap]);
      }
    }
  );

  socket.on(wsEvents.startNight, ({ gameId }) => {
    const participantsArr = [...participantsMap];
    participantsArr
      .filter(([, { roomId }]) => roomId === gameId)
      .forEach((participant) => {
        const [participantIdentity, { user, roomId }] = participant;
        const userWithOffVideo = {
          ...user,
          video: false,
          audio: true,
          offParams: OffParams.Other,
        };
        participantsMap.set(participantIdentity, {
          user: userWithOffVideo,
          roomId,
        });
      });

    io.to(gameId).emit(wsEvents.userStreamStatus, [...participantsMap]);
  });

  socket.on(wsEvents.startDay, ({ gameId }) => {
    const participantsArr = [...participantsMap];
    participantsArr
      .filter(([, { roomId }]) => roomId === gameId)
      .forEach((participant) => {
        const [participantIdentity, { user, roomId }] = participant;
        const userWithOnVideo = { ...user, video: true, audio: true };
        participantsMap.set(participantIdentity, {
          user: userWithOnVideo,
          roomId,
        });
      });

    io.to(gameId).emit(wsEvents.userStreamStatus, [...participantsMap]);
  });

  socket.on(wsEvents.updateSpeaker, ({ userId, gameId }) => {
    const participantsArr = [...participantsMap];
    participantsArr
      .filter(([, { roomId }]) => roomId === gameId)
      .forEach((participant) => {
        const [participantIdentity, { user, roomId }] = participant;
        const userWithOnVideo =
          user.id === userId
            ? { ...user, video: true, audio: true }
            : { ...user, audio: false };

        participantsMap.set(participantIdentity, {
          user: userWithOnVideo,
          roomId,
        });
      });

    io.to(gameId).emit(wsEvents.userStreamStatus, [...participantsMap]);
  });

  socket.on(wsEvents.wakeUp, ({ gameId, users, gm }) => {
    const participantsArr = [...participantsMap];

    const usersToWakeUp = Array.isArray(users) ? users : [users];

    participantsArr
      .filter(([, { roomId }]) => roomId === gameId)
      .forEach((participant) => {
        const [participantIdentity, { user, roomId }] = participant;
        const userWithOnVideo = { ...user, video: true, audio: true };

        participantsMap.set(participantIdentity, {
          user: userWithOnVideo,
          useTo: [...usersToWakeUp, gm],
          roomId,
        });
      });

    io.to(gameId).emit(wsEvents.userStreamStatus, [...participantsMap]);
  });

  // ─── Sleep Confirmation ───────────────────────────────────────────────────

  /**
   * Player confirms they see the night screen.
   * Cancels retry timer, updates sleeping[] in DB and notifies GM via playerSleepAck.
   */
  socket.on(
    wsEvents.playerSleepConfirm,
    async ({ gameId, userId }: { gameId: string; userId: string }) => {
      cancelRetryTimer(gameId, userId);

      const game = await gamesService.updateSleeping(gameId, userId, true);
      if (!game) return;

      const normalized = dataNormalize(game);
      // Notify everyone in the room so GM's store gets updated via gameUpdate
      io.to(gameId).emit(wsEvents.gameUpdate, normalized);
      // Dedicated lightweight ACK so GM can react instantly without processing full gameUpdate
      io.to(gameId).emit(wsEvents.playerSleepAck, { userId });

      console.log(`[Sleep] User ${userId} confirmed sleep in game ${gameId}`);
    }
  );

  /**
   * Player confirms they are awake (night screen dismissed / woken up by GM).
   * Updates sleeping[] in DB and notifies room via playerWakeAck.
   */
  socket.on(
    wsEvents.playerWakeConfirm,
    async ({ gameId, userId }: { gameId: string; userId: string }) => {
      cancelRetryTimer(gameId, userId);

      const game = await gamesService.updateSleeping(gameId, userId, false);
      if (!game) return;

      const normalized = dataNormalize(game);
      io.to(gameId).emit(wsEvents.gameUpdate, normalized);
      io.to(gameId).emit(wsEvents.playerWakeAck, { userId });

      console.log(`[Sleep] User ${userId} confirmed wake in game ${gameId}`);
    }
  );

};
