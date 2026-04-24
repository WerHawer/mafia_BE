import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import {
  RekognitionClient,
  DetectModerationLabelsCommand,
} from '@aws-sdk/client-rekognition';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const bucketName = process.env.AWS_BUCKET_NAME || 'avatars';
const accessKeyId = process.env.AWS_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET;
const region = process.env.AWS_REGION || 'eu-north-1';

const credentials = { accessKeyId, secretAccessKey };

const s3 = new S3Client({ region, credentials });

// Rekognition is not available in eu-north-1 — use eu-west-1 (Ireland)
const REKOGNITION_REGION = 'eu-west-1';
const rekognition = new RekognitionClient({
  region: REKOGNITION_REGION,
  credentials,
});

// Confidence threshold — labels with >= 70% confidence are flagged
const MODERATION_CONFIDENCE_THRESHOLD = 70;

// Full list of AWS Rekognition moderation categories.
// Remove a category from this list to allow that type of content.
const BLOCKED_MODERATION_CATEGORIES: string[] = [
  'Explicit Nudity',
  'Nudity',
  'Graphic Male Nudity',
  'Graphic Female Nudity',
  'Sexual Activity',
  'Illustrated Explicit Nudity',
  'Adult Toys',
  'Suggestive',
  'Female Swimwear Or Underwear',
  'Male Swimwear Or Underwear',
  'Partial Nudity',
  'Barechested Male',
  'Revealing Clothes',
  'Sexual Situations',
  // 'Violence',
  // 'Graphic Violence Or Gore',
  // 'Physical Violence',
  // 'Weapon Violence',
  'Visually Disturbing',
  'Emaciated Bodies',
  'Corpses',
  'Hanging',
  'Air Crash',
  'Explosions And Blasts',
  'Drugs',
  'Drug Products',
  'Drug Use',
  'Pills',
  'Drug Paraphernalia',
  'Tobacco',
  'Tobacco Products',
  'Smoking',
  'Alcohol',
  'Drinking',
  'Alcoholic Beverages',
  'Gambling',
  'Hate Symbols',
  'Nazi Party',
  'White Supremacy',
  'Extremist',
  'Rude Gestures',
  'Middle Finger',
  // 'Weapons',              ← uncomment to block weapons
  // 'Weapon',               ← uncomment to block weapons
  // 'Firearm',              ← uncomment to block firearms
  // 'Knife',                ← uncomment to block knives
];

const linkGenerator = (key: string) =>
  `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

export const deleteFileFromAWS = async (key: string) => {
  const params = {
    Bucket: bucketName,
    Key: key,
  };

  try {
    await s3.send(new DeleteObjectCommand(params));
    console.log(`Avatar ${key} deleted from AWS`);
  } catch (err) {
    console.log('Error', err);
  }
};

export const uploadFileToAWS = async (file: string, key: string) => {
  const fileStream = fs.createReadStream(file);

  const params = {
    Bucket: bucketName,
    Key: key,
    Body: fileStream,
  };

  try {
    await s3.send(new PutObjectCommand(params));
    console.log(`Avatar ${key} uploaded to AWS`);

    return linkGenerator(key);
  } catch (err) {
    console.log('Error', err);
  }
};

export const uploadBufferToAWS = async (
  buffer: Buffer,
  key: string,
  contentType = 'image/jpeg'
): Promise<string> => {
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  };

  await s3.send(new PutObjectCommand(params));
  console.log(`Avatar buffer ${key} uploaded to AWS`);

  return linkGenerator(key);
};

export const downloadBufferFromAWS = async (key: string): Promise<Buffer> => {
  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  const response = await s3.send(command);

  const stream = response.Body as Readable;

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
};

export const checkImageModeration = async (
  filePath: string
): Promise<{ safe: boolean; reason?: string }> => {
  console.log(`[Rekognition] Checking image: ${filePath}`);

  try {
    const imageBytes = fs.readFileSync(filePath);

    const command = new DetectModerationLabelsCommand({
      Image: { Bytes: imageBytes },
      MinConfidence: MODERATION_CONFIDENCE_THRESHOLD,
    });

    const result = await rekognition.send(command);
    const allLabels = result.ModerationLabels ?? [];

    const violations = allLabels.filter(
      (label) =>
        label.Name && BLOCKED_MODERATION_CATEGORIES.includes(label.Name)
    );

    if (violations.length === 0) {
      console.log(`[Rekognition] Image is safe: ${filePath}`);
      return { safe: true };
    }

    const reason = violations.map((label) => label.Name).join(', ');
    console.warn(`[Rekognition] Violations detected in ${filePath}: ${reason}`);

    return { safe: false, reason };
  } catch (err: any) {
    console.error(`[Rekognition] ERROR for "${filePath}":`, {
      name: err?.name,
      message: err?.message,
      code: err?.Code ?? err?.code,
    });

    return { safe: false, reason: 'Content moderation service unavailable' };
  }
};
