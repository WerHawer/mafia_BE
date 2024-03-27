import { Server } from 'socket.io';
import { NextFunction, Request, Response } from 'express';

export const responseWithIo =
  (io: Server) => (req: Request, res: Response, next: NextFunction) => {
    res.io = io;

    next();
  };
