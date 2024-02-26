import { Request, Response } from 'express'

export const errorHandler = (err: Error, req: Request, res: Response, _) => {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  // render the error page
  res.status(500).send(err)
}
