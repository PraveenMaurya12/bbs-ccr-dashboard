import type { Role } from '@prisma/client'

/** Shape attached to `request.user` by JwtStrategy after a token is verified. */
export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  role: Role
}

export interface JwtPayload {
  sub: string
  email: string
  role: Role
}
