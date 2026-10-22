import { useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, LogOut, Settings, User } from 'lucide-react'

import placeholderAvatar from '@/assets/avatars/avatar-07.png'
import { MobileNav } from './MobileNav'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/AuthProvider'

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')
}

export function Header() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center justify-between border-b border-[#ebebeb] bg-white px-4 md:justify-end md:px-4">
      <MobileNav />

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="relative flex size-10 items-center justify-center rounded-lg text-[#5c5c5c] hover:bg-[#f7f7f7]"
          aria-label="Notifications"
        >
          <Bell className="size-5" aria-hidden="true" />
          <span className="absolute top-2 right-2 size-1.5 rounded-full bg-[#fb3748]" aria-hidden="true" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-[10px] border border-[#ebebeb] bg-white py-1 pr-2 pl-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <Avatar className="size-8">
              <AvatarImage src={placeholderAvatar} alt="" />
              <AvatarFallback>{user ? initialsFor(user.name).toUpperCase() : 'CC'}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-[#171717]">{user?.name ?? 'CCR Agent'}</span>
            <ChevronDown className="size-5 text-[#5c5c5c]" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="text-sm font-medium">{user?.name ?? 'CCR Agent'}</p>
              <p className="text-muted-foreground text-xs font-normal">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
