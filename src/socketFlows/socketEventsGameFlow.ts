import { OffParams, wsEvents } from '../wsFlow';

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
};
