import { Document } from 'mongoose';

export const isMongooseDocument = (obj: any): obj is Document => {
  return (
    obj &&
    typeof obj === 'object' &&
    'toObject' in obj &&
    typeof obj.toObject === 'function'
  );
};
