import { useState } from 'react'
import { Menu } from 'lucide-react'

import { SidebarNav } from './Sidebar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { BrandLockup } from '@/features/auth/components/BrandLockup'

export function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 gap-0 border-[#262626] bg-[#171717] p-0 text-white"
      >
        <SheetHeader className="border-b border-[#262626] p-3">
          <SheetTitle className="sr-only">BBS CCR Dashboard navigation</SheetTitle>
          <div className="rounded-[10px] px-3 py-2">
            <BrandLockup iconClassName="size-10" dark />
          </div>
        </SheetHeader>
        <SidebarNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
