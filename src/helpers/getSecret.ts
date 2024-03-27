import dotenv from 'dotenv';
dotenv.config();

export const getSecret = () => process.env.SECRET_KEY || '';
