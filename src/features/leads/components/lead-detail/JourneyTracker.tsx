import { useLayoutEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'

import { formatDateOnly } from '../../utils/leadDisplay'
import type { LeadDetail, PipelineStageStatus } from '../../types'

interface Step {
  label: string
  status: PipelineStageStatus
  /** Only "Lead Captured" has a real, always-present timestamp to show — every other stage's own completion date isn't fetched by this page (no per-stage-dated field exists on LeadDetail), so it shows its status label instead of a fabricated date. */
  dateLabel?: string
}

type StepVisual = 'completed' | 'current' | 'pending' | 'failed'

function visualFor(status: PipelineStageStatus): StepVisual {
  if (status === 'COMPLETED') return 'completed'
  if (status === 'IN_PROGRESS') return 'current'
  if (status === 'FAILED' || status === 'REQUIRES_REVIEW') return 'failed'
  return 'pending'
}

const STATUS_LABEL: Record<PipelineStageStatus, string> = {
  NOT_STARTED: 'Pending',
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  REQUIRES_REVIEW: 'Needs review',
}

const CIRCLE_CLASSES: Record<StepVisual, string> = {
  completed: 'bg-[#335cff] text-white',
  current: 'bg-[#335cff] text-white',
  pending: 'border border-[#ebebeb] bg-white text-[#5c5c5c]',
  failed: 'border border-[#fb3748] bg-white text-[#fb3748]',
}

export function JourneyTracker({ lead }: { lead: LeadDetail }) {
  const steps: Step[] = [
    {
      label: 'Lead Captured',
      status: lead.pipeline.leadSubmissionStatus,
      dateLabel: formatDateOnly(lead.createdAt),
    },
    { label: 'L1 Credit Profile', status: lead.pipeline.level1Status },
    { label: 'L2 Bank Analysis', status: lead.pipeline.level2Status },
    { label: 'L3 Final Profile', status: lead.pipeline.level3Status },
    { label: 'Recovery Plan', status: lead.pipeline.recoveryPlanStatus },
  ]

  const completedCount = (() => {
    let count = 0
    for (const step of steps) {
      if (step.status !== 'COMPLETED') break
      count++
    }
    return count
  })()
  const progressPercent = (completedCount / (steps.length - 1)) * 100

  const rowRef = useRef<HTMLDivElement>(null)
  const circleRefs = useRef<Array<HTMLSpanElement | null>>([])
  // The track must run center-of-first-circle to center-of-last-circle, never
  // edge-to-edge of the row — but step columns are natural-width (sized to
  // each label, not a fixed 85px), so a circle's center isn't at any fixed
  // offset from the row edge. Measuring the real circle positions (rather
  // than guessing an inset from label text) is the only way to get this
  // right regardless of font metrics/label length.
  const [trackInset, setTrackInset] = useState<{ left: number; right: number } | null>(null)

  useLayoutEffect(() => {
    function recompute() {
      const row = rowRef.current
      const first = circleRefs.current[0]
      const last = circleRefs.current[steps.length - 1]
      if (!row || !first || !last) return
      const rowRect = row.getBoundingClientRect()
      const firstRect = first.getBoundingClientRect()
      const lastRect = last.getBoundingClientRect()
      setTrackInset({
        left: firstRect.left + firstRect.width / 2 - rowRect.left,
        right: rowRect.right - (lastRect.left + lastRect.width / 2),
      })
    }
    recompute()
    const row = rowRef.current
    if (!row) return
    const observer = new ResizeObserver(recompute)
    observer.observe(row)
    return () => observer.disconnect()
  }, [steps.length])

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto" role="list" aria-label="Lead journey progress">
      {/* CRITICAL: 5 whitespace-nowrap steps don't fit the card at narrow
          viewports — without this, the row was silently clipped by an
          ancestor's overflow-hidden (never a page-level horizontal
          scroll, so easy to miss), hiding the later steps (e.g. "Recovery
          Plan") entirely rather than making them reachable. A horizontal
          scroll affordance on just this row preserves the exact same
          visual design at every width that already fits. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div ref={rowRef} className="relative z-0 flex items-center gap-4 sm:gap-8">
        {/* Explicit z-0/z-10 (rather than a negative z-index on the track) —
            a negative z-index only paints behind siblings when this row
            itself establishes its own stacking context; relying on that
            without ever giving the row a real z-index let the track escape
            to the page's root stacking context and paint behind the card's
            opaque white background, making it invisible despite otherwise-
            correct box geometry (position/size/color all measured fine in
            devtools — only the paint order was wrong). */}
        <div
          className="absolute top-[9px] z-0 h-0.5 rounded-full bg-[#ebebeb]"
          style={trackInset ? { left: trackInset.left, right: trackInset.right } : { visibility: 'hidden' }}
        >
          <div
            className="h-full rounded-full bg-[#335cff] transition-[width]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {steps.map((step, index) => {
          const visual = visualFor(step.status)
          return (
            <div key={step.label} role="listitem" className="relative z-10 flex flex-col items-center gap-2 text-center">
              <span
                ref={(el) => {
                  circleRefs.current[index] = el
                }}
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${CIRCLE_CLASSES[visual]}`}
              >
                {visual === 'completed' ? <Check className="size-3" aria-hidden="true" /> : index + 1}
              </span>
              <span className="flex flex-col gap-0.5 text-xs leading-4 whitespace-nowrap">
                <span className="font-medium text-[#171717]">{step.label}</span>
                <span className="text-[#5c5c5c]">{step.dateLabel ?? STATUS_LABEL[step.status]}</span>
              </span>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
