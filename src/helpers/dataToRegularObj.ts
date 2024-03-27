import { isMongooseDocument } from './isMongooseDocument';
import { Document } from 'mongoose';

type Data = Document | Record<string, any>;

export const dataToRegularObj = (data: Data | Data[]) => {
  const recursiveObjectCheck = (obj: Record<string, any>) => {
    const newObj: Record<string, any> = {};

    Object.entries(obj).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        newObj[key] = value.map((val) =>
          isMongooseDocument(val) ? val.toObject() : recursiveObjectCheck(val)
        );

        return;
      }

      if (typeof value === 'object' && value !== null) {
        newObj[key] = isMongooseDocument(value)
          ? value.toObject()
          : recursiveObjectCheck(value);

        return;
      }

      newObj[key] = value;
    });

    return newObj;
  };

  if (Array.isArray(data)) {
    return data.map((obj: Data) =>
      isMongooseDocument(obj) ? obj.toObject() : recursiveObjectCheck(obj)
    );
  }

  return isMongooseDocument(data)
    ? data.toObject()
    : recursiveObjectCheck(data);
};
