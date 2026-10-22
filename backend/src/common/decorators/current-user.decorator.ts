import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type'

/** Pulls the authenticated user (attached by JwtAuthGuard) off the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest()
    return request.user as AuthenticatedUser
  },
)
