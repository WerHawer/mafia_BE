import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';
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

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  allowEIO3: true,
  cors: {
    origin: '*',
  },
});

wsFlow(io);

const port = process.env.PORT || 5051;
const mongoURI = process.env.DB_HOST;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(cors());
app.use(morgan('dev'));
app.use(responseNormalizeMiddleware);
app.use(responseErrorMiddleware);
app.use(responseWithIo(io));

app.use('/livekit', livekitRouter);
app.use('/login', loginRouter);
app.use('/signUp', registrationRouter);

app.use(auth);
app.get('/auth', (req, res) => {
  res.sendResponse({ message: 'Authenticated', user: req.user });
});

app.use('/games', gamesRouter);
app.use('/users', usersRouter);
app.use('/messages', messagesRouter);

app.use(errorLogger);
app.use(errorHandler);

const connection = mongoose.connect(mongoURI, { dbName: 'mafia' });

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
