import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from 'livekit-server-sdk';
import dotenv from 'dotenv';

dotenv.config();

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || 'ws://localhost:7880';

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  throw new Error('LiveKit API key and secret must be provided');
}

export class LiveKitService {
  private roomService: RoomServiceClient;

  constructor() {
    this.roomService = new RoomServiceClient(
      LIVEKIT_WS_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET
    );
  }

  /**
   * Generate access token for a user to join a room
   */
  async generateAccessToken(
    roomName: string,
    participantName: string,
    metadata?: string
  ): Promise<string> {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantName,
      metadata: metadata,
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return await token.toJwt();
  }

  /**
   * Create or get a room
   */
  async createRoom(roomName: string): Promise<any> {
    try {
      const room = await this.roomService.createRoom({
        name: roomName,
        emptyTimeout: 300, // 5 minutes
        maxParticipants: 20,
      });

      return room;
    } catch (error) {
      // Room might already exist, try to get it
      try {
        const room = await this.roomService.listRooms();

        return room.find((r) => r.name === roomName);
      } catch (getError) {
        throw new Error(`Failed to create or get room: ${error}`);
      }
    }
  }

  /**
   * List participants in a room
   */
  async listParticipants(roomName: string) {
    try {
      const participants = await this.roomService.listParticipants(roomName);

      return participants;
    } catch (error) {
      throw new Error(`Failed to list participants: ${error}`);
    }
  }

  /**
   * Remove participant from room
   */
  async removeParticipant(roomName: string, participantIdentity: string) {
    try {
      await this.roomService.removeParticipant(roomName, participantIdentity);
    } catch (error) {
      throw new Error(`Failed to remove participant: ${error}`);
    }
  }

  /**
   * Mute/unmute participant
   */
  async muteParticipant(
    roomName: string,
    participantIdentity: string,
    trackSid: string,
    muted: boolean
  ) {
    try {
      await this.roomService.mutePublishedTrack(
        roomName,
        participantIdentity,
        trackSid,
        muted
      );
    } catch (error) {
      throw new Error(`Failed to mute/unmute participant: ${error}`);
    }
  }

  /**
   * Update participant permissions (camera and microphone)
   */
  async updateParticipantPermissions(
    roomName: string,
    participantIdentity: string,
    canPublish: boolean,
    canPublishData?: boolean
  ) {
    try {
      await this.roomService.updateParticipant(
        roomName,
        participantIdentity,
        undefined,
        {
          canPublish,
          canPublishData: canPublishData ?? true,
          canSubscribe: true,
        }
      );
    } catch (error) {
      throw new Error(`Failed to update participant permissions: ${error}`);
    }
  }

  /**
   * Mute participant's published track by source
   */
  async muteParticipantTrackBySource(
    roomName: string,
    participantIdentity: string,
    trackSource: 'camera' | 'microphone',
    muted: boolean
  ) {
    try {
      const participants = await this.listParticipants(roomName);
      const participant = participants.find(
        (p) => p.identity === participantIdentity
      );

      if (!participant) {
        throw new Error(`Participant ${participantIdentity} not found`);
      }

      console.log(
        `[LiveKit] Participant ${participantIdentity} tracks:`,
        participant.tracks.map((t) => ({
          sid: t.sid,
          source: t.source,
          type: t.type,
          muted: t.muted,
        }))
      );

      const targetSource =
        trackSource === 'camera' ? TrackSource.CAMERA : TrackSource.MICROPHONE;

      const track = participant.tracks.find((t) => t.source === targetSource);

      if (!track) {
        console.error(
          `[LiveKit] ${trackSource} track (source=${targetSource}) not found for participant ${participantIdentity}`
        );
        console.error(
          `[LiveKit] Available tracks:`,
          participant.tracks.map((t) => `source=${t.source}, type=${t.type}`)
        );
        throw new Error(
          `${trackSource} track not found for participant ${participantIdentity}`
        );
      }

      console.log(
        `[LiveKit] ${muted ? 'Muting' : 'Unmuting'} ${trackSource} track ${track.sid} for participant ${participantIdentity}`
      );

      await this.roomService.mutePublishedTrack(
        roomName,
        participantIdentity,
        track.sid,
        muted
      );

      console.log(
        `[LiveKit] Successfully ${muted ? 'muted' : 'unmuted'} ${trackSource} for participant ${participantIdentity}`
      );

      return true;
    } catch (error) {
      console.error(
        `[LiveKit] Error ${muted ? 'muting' : 'unmuting'} ${trackSource}:`,
        error
      );
      throw new Error(
        `Failed to ${muted ? 'mute' : 'unmute'} ${trackSource}: ${error}`
      );
    }
  }

  /**
   * Delete room
   */
  async deleteRoom(roomName: string) {
    try {
      await this.roomService.deleteRoom(roomName);
    } catch (error) {
      console.error(`Failed to delete room: ${error}`);
    }
  }

  /**
   * Get room info
   */
  async getRoomInfo(roomName: string) {
    try {
      const rooms = await this.roomService.listRooms();
      return rooms.find((room) => room.name === roomName);
    } catch (error) {
      throw new Error(`Failed to get room info: ${error}`);
    }
  }
}

export const livekitService = new LiveKitService();
