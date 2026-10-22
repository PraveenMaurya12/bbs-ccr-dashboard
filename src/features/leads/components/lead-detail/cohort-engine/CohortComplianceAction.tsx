import { useState } from 'react'
import { ShieldCheck, ShieldX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface ComplianceActionDialogProps {
  mode: 'clear' | 'decline'
  onSubmit: (reason: string) => void
  submitting: boolean
}

function ComplianceActionDialog({ mode, onSubmit, submitting }: ComplianceActionDialogProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const canSubmit = reason.trim().length >= 10

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit(reason.trim())
    setOpen(false)
    setReason('')
  }

  const isClear = mode === 'clear'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={isClear ? 'default' : 'outline'}>
          {isClear ? <ShieldCheck className="mr-1.5 size-3.5" aria-hidden="true" /> : <ShieldX className="mr-1.5 size-3.5" aria-hidden="true" />}
          {isClear ? 'Clear compliance hold' : 'Decline (compliance)'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isClear ? 'Clear compliance hold' : 'Record compliance decline'}</DialogTitle>
          <DialogDescription>
            {isClear
              ? 'v3.0 §7.4: records that compliance has cleared this hold. The engine promotes the next-highest preserved cohort candidate from the current decision — it does not re-run the 24-rule evaluation. This creates a new, immutable decision version; the prior decision is never changed.'
              : 'v3.0 §7.4: records that compliance has declined this case. This always resolves to X2 ("Outside Current Program"), per the spec. This creates a new, immutable decision version; the prior decision is never changed.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`compliance-${mode}-reason`}>Reason (required, at least 10 characters)</Label>
          <Textarea
            id={`compliance-${mode}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isClear ? 'Why compliance is clearing this hold…' : 'Why compliance is declining this case…'}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant={isClear ? 'default' : 'destructive'} disabled={!canSubmit || submitting} onClick={handleSubmit}>
            {submitting ? 'Submitting…' : isClear ? 'Confirm clear' : 'Confirm decline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * v3.0 §7.4 compliance feedback loop — SUPERVISOR/ADMIN only (the backend's
 * RolesGuard is the real enforcement boundary; this component only hides
 * itself from an ordinary CCR). Only rendered while a compliance hold is
 * active and unresolved — once cleared or declined, the hold is gone and
 * these actions no longer apply to the latest decision.
 */
export function CohortComplianceAction({
  onClear,
  onDecline,
  clearSubmitting,
  declineSubmitting,
}: {
  onClear: (reason: string) => void
  onDecline: (reason: string) => void
  clearSubmitting: boolean
  declineSubmitting: boolean
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <ComplianceActionDialog mode="decline" onSubmit={onDecline} submitting={declineSubmitting} />
      <ComplianceActionDialog mode="clear" onSubmit={onClear} submitting={clearSubmitting} />
    </div>
  )
}
