import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { BbsPlanLifecycleStatus } from '../../../types'

const LIFECYCLE_OPTIONS: BbsPlanLifecycleStatus[] = ['DRAFT', 'CCR_REVIEW', 'SPECIALIST_REVIEW', 'CUSTOMER_ACCEPTANCE_PENDING', 'EXECUTION_READY', 'ACTIVE', 'PAUSED', 'REASSESSMENT_REQUIRED', 'COMPLETED', 'CANCELLED']

/**
 * SUPERVISOR/ADMIN-only override of the plan's lifecycle status — the
 * backend's RolesGuard is the real enforcement; this component only hides
 * itself from an ordinary CCR. An override never mutates history — it
 * creates a new, immutable plan version with a logged reason, actor, and
 * timestamp (mirrors CohortOverrideAction exactly).
 */
export function PlanOverrideAction({ onOverride, submitting }: { onOverride: (newLifecycleStatus: BbsPlanLifecycleStatus, reason: string) => void; submitting: boolean }) {
  const [open, setOpen] = useState(false)
  const [newStatus, setNewStatus] = useState<BbsPlanLifecycleStatus>('CANCELLED')
  const [reason, setReason] = useState('')

  function handleSubmit() {
    if (reason.trim().length < 10) return
    onOverride(newStatus, reason.trim())
    setOpen(false)
    setReason('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ShieldAlert className="mr-1.5 size-3.5" aria-hidden="true" />
          Override plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override plan lifecycle status</DialogTitle>
          <DialogDescription>This creates a new, immutable plan version with a logged reason, actor, and timestamp. The original plan is never changed.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-status">New lifecycle status</Label>
            <select id="override-status" className="rounded-lg border border-[#ebebeb] px-3 py-2 text-sm" value={newStatus} onChange={(e) => setNewStatus(e.target.value as BbsPlanLifecycleStatus)}>
              {LIFECYCLE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-reason">Reason (required)</Label>
            <Textarea id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why this override is justified…" rows={4} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={reason.trim().length < 10 || submitting} onClick={handleSubmit}>
            {submitting ? 'Submitting…' : 'Confirm override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
