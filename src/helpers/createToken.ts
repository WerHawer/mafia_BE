import { Types } from 'mongoose';
import { getSecret } from './getSecret';
import jwt from 'jsonwebtoken';

const secret = getSecret();

export const createToken = (payload: {
  id: Types.ObjectId;
  nikName: string;
}): string => jwt.sign(payload, secret, { expiresIn: '1d' });
