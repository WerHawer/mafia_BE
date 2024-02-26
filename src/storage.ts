import multer from 'multer'
import path from 'path'

export const uploadDir = path.join(process.cwd(), 'uploads')

export const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  },
})

export const upload = multer({ storage })
