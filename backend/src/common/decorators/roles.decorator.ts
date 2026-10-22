import { SetMetadata } from '@nestjs/common'
import type { Role } from '@prisma/client'

export const ROLES_KEY = 'roles'
/** Restricts a route to the given roles. Enforced by `RolesGuard`, on the server — never trust a UI-only check. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)
