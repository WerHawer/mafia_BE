import fs from 'fs/promises'

const isAccessible = async (path: string) => {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

export const createFolderIsNotExist = async (folder: string) => {
  if (!(await isAccessible(folder))) {
    await fs.mkdir(folder)
  }
}
