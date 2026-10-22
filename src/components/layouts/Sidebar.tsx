import { NavLink } from 'react-router-dom'

import { NAV_ITEMS, type NavItem } from '@/app/router/navigation'
import { BrandLockup } from '@/features/auth/components/BrandLockup'
import { cn } from '@/lib/utils'

/** Figma "primary-base" (#335cff) — hardcoded like the file's other Figma
 * hex values (#171717/#262626/#a3a3a3/#7b7b7b) since the shared `--primary`
 * token currently resolves to shadcn's unthemed near-black default, not the
 * brand blue, and retheming it is out of scope for the sidebar. */
const ACTIVE_BLUE = '#335cff'

function SidebarLogo() {
  return (
    <div className="rounded-[10px] px-3 py-2">
      <BrandLockup iconClassName="size-10" dark />
    </div>
  )
}

function NavSection({
  title,
  items,
  gap,
  onNavigate,
}: {
  title: string
  items: NavItem[]
  gap: 'main' | 'others'
  onNavigate?: () => void
}) {
  return (
    <div className={cn('flex w-full flex-col', gap === 'main' ? 'gap-2' : 'gap-1.5')}>
      <p className="px-1 py-1 text-xs font-medium tracking-[0.48px] text-[#7b7b7b] uppercase">{title}</p>
      <nav className="flex flex-col gap-1" aria-label={title}>
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-sm font-medium tracking-normal uppercase transition-colors',
                isActive ? 'bg-[#335cff] text-white' : 'text-[#a3a3a3] hover:bg-white/5',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-2 -left-5 h-5 w-1 rounded-r-[4px]"
                    style={{ backgroundColor: ACTIVE_BLUE }}
                  />
                ) : null}
                <item.icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const mainItems = NAV_ITEMS.filter((item) => item.section === 'main')
  const otherItems = NAV_ITEMS.filter((item) => item.section === 'others')

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 pt-5 pb-4">
      <NavSection title="Main" items={mainItems} gap="main" onNavigate={onNavigate} />
      <NavSection title="Others" items={otherItems} gap="others" onNavigate={onNavigate} />
    </div>
  )
}

export function Sidebar() {
  return (
    // sticky + h-svh (not a fixed h-svh + overflow-y-auto on its own nav
    // list): the sidebar tracks the viewport as the document scrolls,
    // without being its own separate scroll container. The nav list is a
    // short, fixed 8 items that always fits within any real viewport
    // height, so this never needs internal scrolling of its own.
    <aside className="sticky top-0 hidden h-svh w-[272px] shrink-0 flex-col border-r border-[#262626] bg-[#171717] md:flex">
      <div className="border-b border-[#262626] p-3">
        <SidebarLogo />
      </div>
      <div className="flex-1">
        <SidebarNav />
      </div>
    </aside>
  )
}
