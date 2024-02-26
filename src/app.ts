import express from 'express';
import peerExpress from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';
import * as mongoose from 'mongoose';
import gamesRouter from './routes/gamesRouter';
import usersRouter from './routes/usersRouter';
import messagesRouter from './routes/messagesRouter';
import { errorLogger } from './middlewares/errorLogger';
import { errorHandler } from './middlewares/errorHandler';
import { createServer } from 'http';
import { uploadDir } from './storage';
import { createFolderIsNotExist } from './helpers/createFolderIsNotExist';
import { connectSocket } from './socketIo';
import { ExpressPeerServer } from 'peer';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
const peerApp = peerExpress();
const httpServer = createServer(app);
const httpPeerServer = createServer(peerApp);
const io = new Server(httpServer);
const peerServer = ExpressPeerServer(httpPeerServer, {
  path: '/video',
});

connectSocket(io);

const port = process.env.PORT || 5000;
const peerPort = process.env.PEER_PORT || 5001;
const mongoURI = process.env.DB_HOST;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(cors());
app.use(morgan('dev'));

let activeConnections = 0;

peerServer.on('connection', (client) => {
  activeConnections++;
  console.log(
    `Client id: ${client.getId()} connected. Total connections: ${activeConnections}`
  );
});

peerServer.on('disconnect', (client) => {
  activeConnections--;
  console.log(
    `Client id: ${client.getId()} disconnected. Total connections: ${activeConnections}`
  );
});

peerApp.use('/peerjs', peerServer);
app.use('/games', gamesRouter);
app.use('/users', usersRouter);
app.use('/messages', messagesRouter);
app.use('/', (req, res) => {
  return res.status(200).json('Hello from server!');
});

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

httpPeerServer.listen(peerPort, () => {
  console.log(`Peer server is running on port: ${peerPort}`);
});
