import { Response } from 'express';

declare module 'express-serve-static-core' {
  interface Response {
    sendResponse(data: any, status?: number): Response;
    sendError(errorMessage: string, statusCode?: number): Response;
  }
}
