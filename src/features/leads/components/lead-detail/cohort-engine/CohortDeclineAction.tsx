import { useState } from 'react'
import { UserX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/**
 * v3.0 §14.3: the explicit customer-decline path — CCR-attested, since
 * this dashboard has no customer portal (documented limitation). Creates a
 * new, immutable decision version with `lifecycleState: CUSTOMER_DECLINED`
 * (terminal) — never mutates the prior decision.
 */
export function CohortDeclineAction({ onDecline, submitting }: { onDecline: (reason: string | null) => void; submitting: boolean }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  function handleSubmit() {
    onDecline(reason.trim().length > 0 ? reason.trim() : null)
    setOpen(false)
    setReason('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserX className="mr-1.5 size-3.5" aria-hidden="true" />
          Record customer decline
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record customer decline</DialogTitle>
          <DialogDescription>
            Use this only when the customer has explicitly declined to proceed. This dashboard has no customer portal, so this is CCR-attested — confirm you
            have the customer&apos;s actual decision before recording it. This creates a new, immutable decision version; the prior decision is never changed.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="decline-reason">Reason (optional)</Label>
          <Textarea id="decline-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="If the customer shared one…" rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={submitting} onClick={handleSubmit}>
            {submitting ? 'Recording…' : 'Confirm decline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
