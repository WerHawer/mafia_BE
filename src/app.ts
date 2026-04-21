import express, { RequestHandler } from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';
import shrinkRay from 'shrink-ray-current';
import * as mongoose from 'mongoose';
import gamesRouter from './routes/gamesRouter';
import usersRouter from './routes/usersRouter';
import messagesRouter from './routes/messagesRouter';
import livekitRouter from './routes/livekitRouter';
import { errorLogger } from './middlewares/errorLogger';
import { errorHandler } from './middlewares/errorHandler';
import { createServer } from 'http';
import { uploadDir } from './storage';
import { createFolderIsNotExist } from './helpers/createFolderIsNotExist';
import { wsFlow } from './wsFlow';
import { Server } from 'socket.io';
import { responseNormalizeMiddleware } from './middlewares/responseNormalizeMiddleware';
import { responseWithIo } from './middlewares/responseWithIo';
import { responseErrorMiddleware } from './middlewares/responseErrorMiddleware';
import loginRouter from './routes/loginRouter';
import { auth } from './middlewares/auth';
import registrationRouter from './routes/registrationRouter';
import refreshRouter from './routes/refreshRouter';
import logoutRouter from './routes/logoutRouter';
import { slowQueryLogger } from './middlewares/slowQueryLogger';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  allowEIO3: true,
  cors: {
    origin: '*',
  },
  // Reduced from defaults (25s/20s) so crashed clients are detected in ~18s instead of ~45s
  pingInterval: 10000,
  pingTimeout: 8000,
});

wsFlow(io);

const port = process.env.PORT || 5051;
const mongoURI = process.env.DB_HOST;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(cors());
app.use(morgan('dev'));
app.use(shrinkRay({
  brotli: { quality: 4 },
  zlib: { level: 6 },
  threshold: 1024,
  filter: (req, res) => {
    // Skip compression for WebSocket upgrade requests
    if (req.headers.upgrade === 'websocket') {
      return false;
    }
    return shrinkRay.filter(req, res);
  },
}) as unknown as RequestHandler);
app.use(slowQueryLogger);
app.use(responseNormalizeMiddleware);
app.use(responseErrorMiddleware);
app.use(responseWithIo(io));

app.use('/livekit', livekitRouter);
app.use('/login', loginRouter);
app.use('/signUp', registrationRouter);
app.use('/refresh', refreshRouter);
app.use('/logout', logoutRouter);

app.use(auth);
app.get('/auth', (req, res) => {
  res.sendResponse({ message: 'Authenticated', user: req.user });
});

app.use('/games', gamesRouter);
app.use('/users', usersRouter);
app.use('/messages', messagesRouter);

app.use(errorLogger);
app.use(errorHandler);

const connection = mongoose.connect(mongoURI, {
  dbName: 'mafia',
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
});

if (process.env.NODE_ENV === 'development') {
  mongoose.set('debug', (collectionName: string, method: string, query: any, doc: any) => {
    const start = Date.now();
    console.log(`[MongoDB] ${collectionName}.${method}`, JSON.stringify(query));

    setImmediate(() => {
      const duration = Date.now() - start;
      if (duration > 100) {
        console.warn(`[SLOW DB QUERY] ${collectionName}.${method} took ${duration}ms`);
      }
    });
  });
}

connection
  .then(() => {
    httpServer.listen(port, () => {
      createFolderIsNotExist(uploadDir);

      console.log(`Server is running on port: ${port}`);
    });
  })
  .catch((err) => {
    console.log(err);
  });
