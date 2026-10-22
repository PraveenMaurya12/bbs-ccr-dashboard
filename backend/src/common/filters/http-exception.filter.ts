import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { MulterError } from 'multer'

/** Multer's own error codes, mapped to a clear, safe client-facing message — see DocumentsModule's file-size limit. */
const MULTER_ERROR_MESSAGE: Record<string, string> = {
  LIMIT_FILE_SIZE: 'This file is too large.',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field.',
}

/**
 * Normalizes every error into one safe response shape and never leaks a
 * stack trace, raw driver error, or config value to the client — only the
 * server log gets the full detail.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter')

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const isHttpException = exception instanceof HttpException
    const isMulterError = exception instanceof MulterError
    const status = isHttpException
      ? exception.getStatus()
      : isMulterError
        ? HttpStatus.BAD_REQUEST
        : HttpStatus.INTERNAL_SERVER_ERROR

    const exceptionResponse = isHttpException ? exception.getResponse() : undefined
    const message = isHttpException
      ? typeof exceptionResponse === 'string'
        ? exceptionResponse
        : ((exceptionResponse as { message?: string | string[] })?.message ?? exception.message)
      : isMulterError
        ? (MULTER_ERROR_MESSAGE[exception.code] ?? 'This file could not be uploaded.')
        : 'An unexpected error occurred'

    if (!isHttpException && !isMulterError) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    })
  }
}
