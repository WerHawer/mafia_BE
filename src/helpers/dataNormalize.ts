import { Document } from 'mongoose';
import { dataToRegularObj } from './dataToRegularObj';

const keysToDelete = ['password', '__v'];

type Data = Document | Record<string, any>;
type DataWithId = { id?: string } & Data;

export const dataNormalize = <
  T extends Data | Data[] = Data,
  R extends DataWithId = T,
>(
  data: T
): R => {
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
