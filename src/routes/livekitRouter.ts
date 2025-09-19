import express from 'express';
import { livekitService } from '../services/livekitService';

const livekitRouter = express.Router();

/**
 * Generate access token for joining a room
 */
livekitRouter.post('/token', async (req, res, next) => {
  try {
    const { roomName, participantName, metadata } = req.body;

    if (!roomName || !participantName) {
      return res.status(400).json({
        error: 'roomName and participantName are required',
      });
    }

    // Ensure room exists
    await livekitService.createRoom(roomName);

    // Generate token
    const token = await livekitService.generateAccessToken(
      roomName,
      participantName,
      metadata
    );

    res.sendResponse({
      token,
      wsUrl: process.env.LIVEKIT_WS_URL || 'ws://localhost:7880',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Create a new room
 */
livekitRouter.post('/rooms', async (req, res, next) => {
  try {
    const { roomName } = req.body;

    if (!roomName) {
      return res.status(400).json({
        error: 'roomName is required',
      });
    }

    const room = await livekitService.createRoom(roomName);

    res.sendResponse({
      room,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get room info and participants
 */
livekitRouter.get('/rooms/:roomName', async (req, res, next) => {
  try {
    const { roomName } = req.params;

    const [roomInfo, participants] = await Promise.all([
      livekitService.getRoomInfo(roomName),
      livekitService.listParticipants(roomName),
    ]);

    res.sendResponse({
      room: roomInfo,
      participants,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Remove participant from room
 */
livekitRouter.delete(
  '/rooms/:roomName/participants/:participantId',
  async (req, res, next) => {
    try {
      const { roomName, participantId } = req.params;

      await livekitService.removeParticipant(roomName, participantId);

      res.sendResponse({
        message: 'Participant removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Mute/unmute participant
 */
livekitRouter.patch(
  '/rooms/:roomName/participants/:participantId/mute',
  async (req, res, next) => {
    try {
      const { roomName, participantId } = req.params;
      const { trackSid, muted } = req.body;

      if (!trackSid || typeof muted !== 'boolean') {
        return res.status(400).json({
          error: 'trackSid and muted (boolean) are required',
        });
      }

      await livekitService.muteParticipant(
        roomName,
        participantId,
        trackSid,
        muted
      );

      res.sendResponse({
        message: `Participant ${muted ? 'muted' : 'unmuted'} successfully`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Delete room
 */
livekitRouter.delete('/rooms/:roomName', async (req, res, next) => {
  try {
    const { roomName } = req.params;

    await livekitService.deleteRoom(roomName);

    res.sendResponse({
      message: 'Room deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default livekitRouter;
