/**
 * Migration: migrateAvatarsToResponsive
 *
 * Finds all avatar documents that still use the old single `url: string` format
 * and converts them to the new `urls: { sm, md, lg }` multi-size format.
 *
 * For each legacy avatar:
 *   1. Extract the S3 key from the stored URL
 *   2. Download the original image buffer from S3
 *   3. Resize to 3 sizes (24×24, 64×64, 120×120) using sharp
 *   4. Upload all 3 variants to S3 in parallel
 *   5. Update the MongoDB document with the new `urls` structure
 *   6. Optionally delete the original oversized file from S3
 *
 * Usage:
 *   yarn tsx src/migrations/migrateAvatarsToResponsive.ts
 *
 * Safe to re-run — already-migrated documents (those with `urls`) are skipped.
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import sharp from 'sharp';
import { uploadBufferToAWS, downloadBufferFromAWS, deleteFileFromAWS } from '../awsSdk';
import { AVATAR_SIZES, AvatarSize } from '../helpers/resizeAvatar';
import { IUserAvatarUrls } from '../subjects/users/usersTypes';

// ─── Raw Mongoose model (bypasses TypeScript schema to read legacy `url` field) ───

interface LegacyAvatarDoc {
  _id: mongoose.Types.ObjectId;
  url?: string;
  urls?: IUserAvatarUrls;
}

const rawAvatarSchema = new mongoose.Schema(
  {
    url: String,
    urls: {
      sm: String,
      md: String,
      lg: String,
    },
  },
  { strict: false }
);

const LegacyAvatar = mongoose.model<LegacyAvatarDoc>(
  'avatars',
  rawAvatarSchema,
  'avatars'
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const extractS3Key = (url: string): string => {
  // URL pattern: https://bucket.s3.region.amazonaws.com/KEY
  const parts = url.split('.amazonaws.com/');
  if (parts.length < 2) {
    throw new Error(`Cannot extract S3 key from URL: ${url}`);
  }
  return parts[1];
};

const resizeBufferToAllSizes = async (
  inputBuffer: Buffer
): Promise<Record<AvatarSize, Buffer>> => {
  const [sm, md, lg] = await Promise.all(
    AVATAR_SIZES.map(({ width, height }) =>
      sharp(inputBuffer)
        .resize(width, height, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer()
    )
  );

  return { sm, md, lg };
};

// ─── Migration ────────────────────────────────────────────────────────────────

const migrateAvatar = async (
  doc: LegacyAvatarDoc,
  index: number,
  total: number
): Promise<void> => {
  const logPrefix = `[${index + 1}/${total}] Avatar ${doc._id}`;

  // Skip already-migrated documents
  if (doc.urls?.sm && doc.urls?.md && doc.urls?.lg) {
    console.log(`${logPrefix} — already migrated, skipping`);
    return;
  }

  if (!doc.url) {
    console.warn(`${logPrefix} — no url or urls field, skipping`);
    return;
  }

  const originalKey = extractS3Key(doc.url);
  const timestamp = Date.now();
  // Preserve the original filename portion for traceability
  const originalFilename = originalKey.split('/').pop() ?? originalKey;

  console.log(`${logPrefix} — downloading original: ${originalKey}`);

  let originalBuffer: Buffer;
  try {
    originalBuffer = await downloadBufferFromAWS(originalKey);
  } catch (err) {
    console.error(`${logPrefix} — failed to download from S3:`, err);
    return;
  }

  console.log(`${logPrefix} — resizing to ${AVATAR_SIZES.map((s) => s.key).join(', ')}`);

  const resizedBuffers = await resizeBufferToAllSizes(originalBuffer);

  console.log(`${logPrefix} — uploading 3 variants to S3`);

  const uploadResults = await Promise.all(
    AVATAR_SIZES.map(({ key }) => {
      const s3Key = `${timestamp}_${key}_${originalFilename}`;
      return uploadBufferToAWS(resizedBuffers[key], s3Key).then((url) => ({
        key,
        url,
      }));
    })
  );

  const urls = uploadResults.reduce<IUserAvatarUrls>(
    (acc, { key, url }) => ({ ...acc, [key]: url }),
    {} as IUserAvatarUrls
  );

  // Update MongoDB: set `urls`, unset legacy `url`
  await LegacyAvatar.updateOne(
    { _id: doc._id },
    { $set: { urls }, $unset: { url: '' } }
  );

  console.log(`${logPrefix} — DB updated ✓`);

  // Remove the original full-size file from S3 to free up storage
  try {
    await deleteFileFromAWS(originalKey);
    console.log(`${logPrefix} — original S3 file deleted: ${originalKey}`);
  } catch (err) {
    // Non-fatal — log and continue
    console.warn(`${logPrefix} — could not delete original from S3:`, err);
  }

  console.log(`${logPrefix} — migration complete ✓`);
};

const run = async (): Promise<void> => {
  const mongoURI = process.env.DB_HOST;

  if (!mongoURI) {
    throw new Error('DB_HOST environment variable is not set');
  }

  console.log('[Migration] Connecting to MongoDB...');

  await mongoose.connect(mongoURI, { dbName: 'mafia' });

  console.log('[Migration] Connected ✓');

  // Load all avatar docs (both legacy and already migrated)
  const allAvatars = await LegacyAvatar.find({}).lean<LegacyAvatarDoc[]>();

  const legacy = allAvatars.filter((doc) => doc.url && !doc.urls?.sm);
  const alreadyMigrated = allAvatars.length - legacy.length;

  console.log(
    `[Migration] Found ${allAvatars.length} total avatars — ${legacy.length} to migrate, ${alreadyMigrated} already done`
  );

  if (legacy.length === 0) {
    console.log('[Migration] Nothing to do. Exiting.');
    await mongoose.disconnect();
    return;
  }

  let successCount = 0;
  let failCount = 0;

  // Process sequentially to avoid overwhelming S3 / memory
  for (let i = 0; i < legacy.length; i++) {
    try {
      await migrateAvatar(legacy[i], i, legacy.length);
      successCount++;
    } catch (err) {
      console.error(`[Migration] Unhandled error for avatar ${legacy[i]._id}:`, err);
      failCount++;
    }
  }

  console.log('\n─────────────────────────────────────');
  console.log(`[Migration] Done!`);
  console.log(`  ✓ Migrated: ${successCount}`);
  console.log(`  ✗ Failed:   ${failCount}`);
  console.log(`  ⊘ Skipped:  ${alreadyMigrated}`);
  console.log('─────────────────────────────────────\n');

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('[Migration] Fatal error:', err);
  process.exit(1);
});

