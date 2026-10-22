import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CohortPrimaryState } from '../../../types'

const COHORT_OPTIONS: CohortPrimaryState[] = [
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'X1', 'X2',
  'CONSENT_PENDING', 'KYC_PENDING', 'COMPLIANCE_HOLD', 'DATA_REFRESH_REQUIRED', 'OTHER_ACCOUNTS_REQUIRED', 'P1_INFORMATION_REQUIRED', 'SPECIALIST_REQUIRED', 'CCR_REQUIRED',
  'MANUAL_REVIEW', 'CUSTOMER_UNRESPONSIVE',
]

/** v3.0 §19.2: maker-checker required for an override landing on these three — a second approver distinct from the acting user. Enforced server-side (this is only the UI prompt). */
const MAKER_CHECKER_COHORTS: ReadonlySet<CohortPrimaryState> = new Set(['C1', 'C4', 'C6'])

/**
 * Spec Part 23's "Specialist / Manual Review" override action —
 * SUPERVISOR/ADMIN only (the backend's RolesGuard is the real
 * enforcement; this component only hides itself from an ordinary CCR, it
 * is never the actual security boundary). An override never mutates
 * history — it creates a new, immutable decision version with a logged
 * reason, actor, and timestamp.
 */
export function CohortOverrideAction({ onOverride, submitting }: { onOverride: (newPrimaryCohort: CohortPrimaryState, reason: string, approverId?: string) => void; submitting: boolean }) {
  const [open, setOpen] = useState(false)
  const [newCohort, setNewCohort] = useState<CohortPrimaryState>('C2')
  const [reason, setReason] = useState('')
  const [approverId, setApproverId] = useState('')

  const requiresApprover = MAKER_CHECKER_COHORTS.has(newCohort)
  const canSubmit = reason.trim().length >= 10 && (!requiresApprover || approverId.trim().length > 0)

  function handleSubmit() {
    if (!canSubmit) return
    onOverride(newCohort, reason.trim(), requiresApprover ? approverId.trim() : undefined)
    setOpen(false)
    setReason('')
    setApproverId('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ShieldAlert className="mr-1.5 size-3.5" aria-hidden="true" />
          Override cohort
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override cohort decision</DialogTitle>
          <DialogDescription>This creates a new, immutable decision version with a logged reason, actor, and timestamp. The original decision is never changed.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-cohort">New primary state</Label>
            <select id="override-cohort" className="rounded-lg border border-[#ebebeb] px-3 py-2 text-sm" value={newCohort} onChange={(e) => setNewCohort(e.target.value as CohortPrimaryState)}>
              {COHORT_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-reason">Reason (required)</Label>
            <Textarea id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why this override is justified…" rows={4} />
          </div>
          {requiresApprover && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-approver">Approver user ID (required — maker-checker, §19.2)</Label>
              <input id="override-approver" className="rounded-lg border border-[#ebebeb] px-3 py-2 text-sm" value={approverId} onChange={(e) => setApproverId(e.target.value)} placeholder="A second approver distinct from you" />
              <p className="text-xs text-[#a3a3a3]">Overrides landing on C1, C4, or C6 require a second approver distinct from the acting user.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || submitting} onClick={handleSubmit}>
            {submitting ? 'Submitting…' : 'Confirm override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
