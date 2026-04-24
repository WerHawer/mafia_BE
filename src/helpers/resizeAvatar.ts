import sharp from 'sharp';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarSizeConfig {
  key: AvatarSize;
  width: number;
  height: number;
}

// Three distinct sizes so the frontend can load only what it needs:
// sm  — tiny icon (e.g. chat list, player card badge)
// md  — medium thumbnail (e.g. in-game participant strip)
// lg  — full profile avatar
export const AVATAR_SIZES: AvatarSizeConfig[] = [
  { key: 'sm', width: 24, height: 24 },
  { key: 'md', width: 64, height: 64 },
  { key: 'lg', width: 120, height: 120 },
];

export interface ResizedAvatarBuffers {
  sm: Buffer;
  md: Buffer;
  lg: Buffer;
}

export const resizeAvatar = async (
  inputPath: string
): Promise<ResizedAvatarBuffers> => {
  const [sm, md, lg] = await Promise.all(
    AVATAR_SIZES.map(({ width, height }) =>
      sharp(inputPath)
        .resize(width, height, {
          fit: 'cover',
          position: 'centre',
        })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer()
    )
  );

  return { sm, md, lg };
};

