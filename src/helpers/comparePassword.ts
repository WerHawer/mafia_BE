import bCrypt from 'bcryptjs';

export const comparePassword = (password: string, hashedPassword: string) => {
  return bCrypt.compareSync(password, hashedPassword);
};
