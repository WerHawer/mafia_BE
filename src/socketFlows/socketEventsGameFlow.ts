import { OffParams, wsEvents } from '../wsFlow';

export const socketEventsGameFlow = ({ io, socket, streamsMap }) => {
  socket.on(
    wsEvents.userVideoStatus,
    ({ streamId, roomId, video, offParams }) => {
      streamsMap.get(streamId).user.video = video;
      streamsMap.get(streamId).user.offParams = offParams;

      io.to(roomId).emit(wsEvents.userStreamStatus, [...streamsMap]);
    }
  );

  socket.on(
    wsEvents.userAudioStatus,
    ({ streamId, roomId, audio, offParams }) => {
      streamsMap.get(streamId).user.audio = audio;
      streamsMap.get(streamId).user.offParams = offParams;

      io.to(roomId).emit(wsEvents.userStreamStatus, [...streamsMap]);
    }
  );

  socket.on(wsEvents.startNight, ({ gameId }) => {
    const streamsArr = [...streamsMap];
    streamsArr
      .filter(([, { roomId }]) => roomId === gameId)
      .forEach((stream) => {
        const [streamId, { user, roomId }] = stream;
        const userWithOffVideo = {
          ...user,
          video: false,
          audio: true,
          offParams: OffParams.Other,
        };
        streamsMap.set(streamId, { user: userWithOffVideo, roomId });
      });

    io.to(gameId).emit(wsEvents.userStreamStatus, [...streamsMap]);
  });

  socket.on(wsEvents.startDay, ({ gameId }) => {
    const streamsArr = [...streamsMap];
    streamsArr
      .filter(([, { roomId }]) => roomId === gameId)
      .forEach((stream) => {
        const [streamId, { user, roomId }] = stream;
        const userWithOnVideo = { ...user, video: true, audio: true };
        streamsMap.set(streamId, { user: userWithOnVideo, roomId });
      });

    io.to(gameId).emit(wsEvents.userStreamStatus, [...streamsMap]);
  });

  socket.on(wsEvents.updateSpeaker, ({ userId, gameId }) => {
    const streamsArr = [...streamsMap];
    streamsArr
      .filter(([, { roomId }]) => roomId === gameId)
      .forEach((stream) => {
        const [streamId, { user, roomId }] = stream;
        const userWithOnVideo =
          user.id === userId
            ? { ...user, video: true, audio: true }
            : { ...user, audio: false };

        streamsMap.set(streamId, { user: userWithOnVideo, roomId });
      });

    io.to(gameId).emit(wsEvents.userStreamStatus, [...streamsMap]);
  });

  socket.on(wsEvents.wakeUp, ({ gameId, users, gm }) => {
    const streamsArr = [...streamsMap];

    const usersToWakeUp = Array.isArray(users) ? users : [users];

    streamsArr
      .filter(([, { roomId }]) => roomId === gameId)
      .forEach((stream) => {
        const [streamId, { user, roomId }] = stream;
        const userWithOnVideo = { ...user, video: true, audio: true };

        streamsMap.set(streamId, {
          user: userWithOnVideo,
          useTo: [...usersToWakeUp, gm],
          roomId,
        });
      });

    io.to(gameId).emit(wsEvents.userStreamStatus, [...streamsMap]);
  });
};
