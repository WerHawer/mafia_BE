import { Request, Response, NextFunction } from 'express'
import multer from 'multer'

export const errorHandler = (err: Error, req: Request, res: Response, _: NextFunction) => {
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File is too large. Maximum allowed size is 5MB.' })
    }
    return res.status(400).json({ message: `Upload error: ${err.message}` })
  }

  // fileFilter validation error
  if (err.message?.startsWith('Invalid file type')) {
    return res.status(400).json({ message: err.message })
  }

  res.status(500).send(err)
}
