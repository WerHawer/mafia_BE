import { Document, Types } from 'mongoose';
import { dataToRegularObj } from './dataToRegularObj';

const keysToDelete = ['password', '__v'];

const isObjectId = (val: any): val is Types.ObjectId =>
  val instanceof Types.ObjectId || val?._bsontype === 'ObjectId';

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
    // Convert ObjectId instances to plain hex strings immediately
    if (isObjectId(data)) {
      return data.toString();
    }

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
        newData.id = isObjectId(value) ? value.toString() : String(value);

        return;
      }

      if (key === 'avatar') {
        newData[key] = Array.isArray(value) ? value[0]?.url : (value as Record<string, string>)?.url ?? value;

        return;
      }

      newData[key] = normalize(value);
    });

    return newData;
  };

  return normalize(objectData);
};
