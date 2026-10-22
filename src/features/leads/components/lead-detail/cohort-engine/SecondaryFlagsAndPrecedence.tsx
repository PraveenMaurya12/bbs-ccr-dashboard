import { Flag, ListOrdered } from 'lucide-react'

import type { CohortDecisionReport } from '../../../types'
import { NotAvailable, SectionCard } from '../shared/SectionCard'
import { CohortPrimaryBadge } from './CohortBadges'

/** Spec Part 23's "Secondary Flags" — every lower-precedence match preserved, never discarded. */
export function SecondaryFlagsSection({ flags }: { flags: CohortDecisionReport['secondaryFlags'] }) {
  return (
    <SectionCard icon={Flag} title="Secondary flags">
      {!flags || flags.length === 0 ? (
        <NotAvailable reason="No other condition was matched for this lead." />
      ) : (
        <ul className="flex flex-col gap-2">
          {flags.map((flag) => (
            <li key={flag.key} className="flex flex-col gap-0.5 border-b border-[#ebebeb] pb-2 last:border-0 last:pb-0">
              <p className="text-sm font-medium text-[#171717]">{flag.label}</p>
              <p className="text-xs text-[#5c5c5c]">{flag.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

/** BBS Cohort Engine Module v3.0 §6.1's own precedence order, verbatim: priorities 1.0-1.8 (every BLOCKED reason), then 2-9 (real Type-A cohorts, falling through to MANUAL_REVIEW at priority 9). */
const PRECEDENCE_ORDER: Array<{ cohort: CohortDecisionReport['primaryCohort']; label: string }> = [
  { cohort: 'CONSENT_PENDING', label: '1.0 — Consent pending' },
  { cohort: 'KYC_PENDING', label: '1.1 — KYC pending' },
  { cohort: 'COMPLIANCE_HOLD', label: '1.2 — Compliance hold' },
  { cohort: 'DATA_REFRESH_REQUIRED', label: '1.25 — Data refresh required' },
  { cohort: 'OTHER_ACCOUNTS_REQUIRED', label: '1.3 — Other accounts required' },
  { cohort: 'P1_INFORMATION_REQUIRED', label: '1.4 — P1 information required' },
  { cohort: 'MANUAL_REVIEW', label: '1.5/1.7/9 — Manual review (mismatch, exceptions, or fallback)' },
  { cohort: 'SPECIALIST_REQUIRED', label: '1.6/1.8 — Specialist required (legal status or exceptions)' },
  { cohort: 'C5', label: '2 — Debt-cycle intervention' },
  { cohort: 'C4', label: '3 — Resolution candidate' },
  { cohort: 'C3', label: '4 — Restructure candidate' },
  { cohort: 'C2', label: '5 — Consolidation candidate' },
  { cohort: 'C1', label: '6 — Stabilisation ready' },
  { cohort: 'C7', label: '7 — Recovery / credit rebuild' },
  { cohort: 'X2', label: '8 — Outside current program' },
]

/** v3.0 §3.2: these three values are never decided by the internal 24-rule precedence table at all — X1/CCR_REQUIRED come from Master Profile's own upstream readiness-gate short-circuit (which always wins over internal precedence), and CUSTOMER_UNRESPONSIVE is only ever set via an explicit CCR override. */
const UPSTREAM_ONLY_COHORTS: ReadonlySet<CohortDecisionReport['primaryCohort']> = new Set(['X1', 'CCR_REQUIRED', 'CUSTOMER_UNRESPONSIVE'])

/** Spec Part 23's "Precedence" panel — which cohorts matched vs. the one selected, with the explanatory sentence. */
export function PrecedenceSection({ decision }: { decision: CohortDecisionReport }) {
  const secondaryCohortKeys = new Set((decision.secondaryFlags ?? []).map((f) => f.key))
  const isUpstreamOnly = decision.primaryCohort !== null && UPSTREAM_ONLY_COHORTS.has(decision.primaryCohort)

  return (
    <SectionCard icon={ListOrdered} title="Precedence">
      <ul className="flex flex-col gap-1.5">
        {PRECEDENCE_ORDER.map((row) => {
          const isPrimary = row.cohort === decision.primaryCohort
          const isSecondary = secondaryCohortKeys.has(row.cohort as string)
          return (
            <li key={row.cohort} className="flex items-center justify-between gap-2 text-sm">
              <span className={isPrimary ? 'font-medium text-[#171717]' : 'text-[#5c5c5c]'}>{row.label}</span>
              {isPrimary ? <CohortPrimaryBadge cohort={row.cohort} /> : isSecondary ? <span className="text-xs text-[#8e51ff]">Also matched</span> : <span className="text-xs text-[#a3a3a3]">No</span>}
            </li>
          )
        })}
      </ul>
      {isUpstreamOnly ? (
        <p className="mt-3 text-xs text-[#5c5c5c]">
          {decision.primaryCohort} was set by Master Profile&apos;s own readiness-gate routing (§3.2) or an explicit CCR action — it is never a row in this
          lead&apos;s own 24-rule precedence table, which always yields to that upstream signal.
        </p>
      ) : (
        <p className="mt-3 text-xs text-[#5c5c5c]">
          {decision.primaryCohort} selected because it has the highest precedence among all matched conditions under Cohort Policy {decision.ruleVersion}.
        </p>
      )}
    </SectionCard>
  )
}
