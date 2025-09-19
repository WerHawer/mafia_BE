import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
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
