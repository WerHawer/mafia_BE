import { Response } from 'express';
import { Server } from 'socket.io';

declare module 'express-serve-static-core' {
  interface Response {
    sendResponse(data: any, status?: number): Response;
    sendError(args: {
      message: string;
      status?: number;
      field?: string;
    }): Response;
    io: Server;
  }
}
