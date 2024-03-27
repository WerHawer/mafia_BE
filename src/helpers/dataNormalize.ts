import { Document } from 'mongoose';
import { dataToRegularObj } from './dataToRegularObj';

const keysToDelete = ['password', '__v'];

type DataWithId = { id?: string; [key: string]: any };
type Data = Document | Record<string, any>;

export const dataNormalize = (
  data: Data | Data[]
): DataWithId | DataWithId[] => {
  const objectData = dataToRegularObj(data);

  const normalize = (data: any): any => {
    if (Array.isArray(data)) {
      return data.map(normalize);
    }

    if (data instanceof Date || typeof data !== 'object' || data === null) {
      return data;
    }

    const newData: DataWithId = {};

    Object.entries(data).forEach(([key, value]) => {
      if (keysToDelete.includes(key)) {
        return;
      }

      if (key === '_id') {
        newData.id = value.toString();

        return;
      }

      if (key === 'avatar') {
        newData[key] = value[0]?.url;

        return;
      }

      newData[key] = normalize(value);
    });

    return newData;
  };

  return normalize(objectData);
};
