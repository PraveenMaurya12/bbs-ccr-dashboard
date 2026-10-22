import { useState } from 'react'
import { ChevronDown, ChevronRight, Compass, Loader2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ErrorState } from '@/components/shared/ErrorState'
import { QueryBoundary } from '@/components/shared/QueryBoundary'
import { Button } from '@/components/ui/button'
import { pathwayEngineService } from '../../../services/pathwayEngineService'
import type { PathwayAlternative, PathwayDecisionHistoryEntry, PathwayDecisionReport, PathwayRuleResultRecord } from '../../../types'

const ACCENT = '#0e9f6e' // Pathway Engine's own distinct accent — the 6th module in this per-module visual-distinction convention (Debt/Financial/Master/Cohort/Plan already each have their own).

function Pill({ label, textClassName, bgClassName }: { label: string; textClassName: string; bgClassName: string }) {
  return <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ${textClassName} ${bgClassName}`}>{label}</span>
}

const STATUS_META: Record<string, { label: string; textClassName: string; bgClassName: string }> = {
  READY: { label: 'Ready', textClassName: 'text-white', bgClassName: 'bg-[#0e9f6e]' },
  BLOCKED: { label: 'Blocked', textClassName: 'text-white', bgClassName: 'bg-[#fb3748]' },
  INSUFFICIENT_DATA: { label: 'Insufficient data', textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  SPECIALIST_REVIEW: { label: 'Specialist review', textClassName: 'text-[#8e51ff]', bgClassName: 'bg-[#f4edff]' },
  MANUAL_REVIEW: { label: 'Manual review', textClassName: 'text-[#8e51ff]', bgClassName: 'bg-[#f4edff]' },
  OUT_OF_SCOPE: { label: 'Outside current program', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
  NO_SUITABLE_PATHWAY: { label: 'No suitable pathway', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  EXPIRED: { label: 'Expired', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
  EXPIRED_UNACCEPTED: { label: 'Expired (not accepted)', textClassName: 'text-[#fb3748]', bgClassName: 'bg-[#ffebec]' },
}

const CONFIDENCE_META: Record<string, { textClassName: string; bgClassName: string }> = {
  HIGH: { textClassName: 'text-[#1fc16b]', bgClassName: 'bg-[#e3f7ec]' },
  MEDIUM: { textClassName: 'text-[#f6b51e]', bgClassName: 'bg-[#fffaeb]' },
  LOW: { textClassName: 'text-[#fa7319]', bgClassName: 'bg-[#fff3eb]' },
  UNRESOLVED: { textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' },
}

function AlternativeRow({ alt }: { alt: PathwayAlternative }) {
  return (
    <div className="rounded-xl border border-[#ebebeb] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[#171717]">{alt.pathway}</span>
        <span className="text-xs text-[#a3a3a3]">score {alt.suitabilityScore.toFixed(2)}</span>
      </div>
      <p className="mt-1 text-xs text-[#5c5c5c]">Not primary: {alt.reasonNotPrimary}</p>
      <p className="text-xs text-[#a3a3a3]">Switch trigger: {alt.switchTrigger}</p>
    </div>
  )
}

function RuleRow({ rule }: { rule: PathwayRuleResultRecord }) {
  const [expanded, setExpanded] = useState(false)
  const evalColor = rule.evaluation === 'FIRED' ? 'text-[#fb3748]' : rule.evaluation === 'NOT_FIRED' ? 'text-[#1fc16b]' : 'text-[#a3a3a3]'
  return (
    <div className="border-b border-[#f0f0f0] last:border-0">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-2 py-2 text-left">
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="size-3.5 shrink-0 text-[#a3a3a3]" aria-hidden="true" /> : <ChevronRight className="size-3.5 shrink-0 text-[#a3a3a3]" aria-hidden="true" />}
          <span className="font-mono text-xs text-[#171717]">{rule.ruleId}</span>
        </div>
        <span className={`text-xs font-medium ${evalColor}`}>{rule.evaluation}</span>
      </button>
      {expanded && <p className="pb-2 pl-6 text-xs text-[#5c5c5c]">{rule.reason}</p>}
    </div>
  )
}

function PathwayHero({ decision, onEvaluate, evaluating }: { decision: PathwayDecisionReport; onEvaluate: () => void; evaluating: boolean }) {
  const statusMeta = STATUS_META[decision.pathwayStatus ?? ''] ?? { label: decision.pathwayStatus ?? 'Unknown', textClassName: 'text-[#a3a3a3]', bgClassName: 'bg-[#f7f7f7]' }
  const confidenceMeta = CONFIDENCE_META[decision.confidence ?? ''] ?? CONFIDENCE_META.UNRESOLVED!
  return (
    <div className="rounded-2xl border border-[#ebebeb] bg-white p-5 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Compass className="size-6" style={{ color: ACCENT }} aria-hidden="true" />
          <div>
            <p className="text-lg font-medium tracking-[-0.2px] text-[#171717]">{decision.primaryPathway ?? 'No pathway'}</p>
            <p className="text-xs text-[#a3a3a3]">v{decision.version} · {decision.ruleVersion} {decision.isStale && <span className="text-[#fb3748]">· stale, Cohort Decision has moved on</span>}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill label={statusMeta.label} textClassName={statusMeta.textClassName} bgClassName={statusMeta.bgClassName} />
          <Pill label={`Confidence: ${decision.confidence ?? 'UNRESOLVED'}`} textClassName={confidenceMeta.textClassName} bgClassName={confidenceMeta.bgClassName} />
        </div>
      </div>
      {decision.blockingReason && (
        <div className="mt-3 rounded-lg bg-[#ffebec] px-3 py-2 text-xs text-[#fb3748]">
          Blocked: {decision.blockingReason}
          {decision.inheritedBlocks && decision.inheritedBlocks.length > 1 && <> — inherited blocks: {decision.inheritedBlocks.join(', ')}</>}
        </div>
      )}
      {decision.sequencingHint && (
        <div className="mt-3 rounded-lg bg-[#e3f7ec] px-3 py-2 text-xs text-[#1fc16b]">
          Natural next step: {decision.sequencingHint.naturalNext} (trigger: {decision.sequencingHint.trigger})
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button size="sm" variant="outline" disabled={evaluating} onClick={onEvaluate}>
          {evaluating ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" /> : null}
          Re-evaluate
        </Button>
      </div>
    </div>
  )
}

/**
 * BBS Pathway Engine Module v3.0 (L5) — the Final Cohort Decision ->
 * Pathway handoff. Sits between the Cohort Assessment (final-profile tab)
 * and the BBS Plan (this same recovery-plan tab, below). Never runs
 * against a stale Cohort Decision — the "Re-evaluate" action is always
 * CCR-initiated, never automatic.
 */
export function PathwayDecisionSection({ bbsLeadId }: { bbsLeadId: string }) {
  const queryClient = useQueryClient()
  const queryKey = ['pathwayDecision', bbsLeadId]

  const query = useQuery({
    queryKey,
    queryFn: () => pathwayEngineService.getForLead(bbsLeadId),
    refetchInterval: (q) => {
      const data = q.state.data
      if (!data?.decisionAvailable) return false
      return data.status === 'GENERATING' ? 2000 : false
    },
  })

  const historyQuery = useQuery({
    queryKey: ['pathwayDecisionHistory', bbsLeadId],
    queryFn: () => pathwayEngineService.getHistory(bbsLeadId),
    enabled: query.data?.decisionAvailable === true && query.data.status === 'COMPLETED',
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey })
    queryClient.invalidateQueries({ queryKey: ['pathwayDecisionHistory', bbsLeadId] })
    // A Pathway re-evaluation can change the authoritative pathway Plan
    // Engine reads — invalidate the Plan query too so a stale Plan banner
    // appears immediately rather than only after its own next poll.
    queryClient.invalidateQueries({ queryKey: ['bbsPlan', bbsLeadId] })
  }

  const evaluateMutation = useMutation({ mutationFn: () => pathwayEngineService.evaluate(bbsLeadId), onSuccess: invalidateAll })
  const reassessMutation = useMutation({ mutationFn: () => pathwayEngineService.reassess(bbsLeadId), onSuccess: invalidateAll })

  return (
    <QueryBoundary query={query}>
      {(data) => {
        if (!data.decisionAvailable) {
          return (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#ebebeb] bg-white p-8 text-center">
              <Compass className="size-8" style={{ color: ACCENT }} aria-hidden="true" />
              <div>
                <p className="text-base font-medium text-[#171717]">Pathway not evaluated yet</p>
                <p className="mt-1 max-w-md text-sm text-[#5c5c5c]">
                  {data.cohortDecisionReady ? 'The Cohort Decision is ready — evaluate a Pathway to determine the recovery direction before generating a Plan.' : 'Complete the Cohort Assessment on the Final Profile tab before evaluating a Pathway.'}
                </p>
              </div>
              {data.cohortDecisionReady && (
                <Button disabled={evaluateMutation.isPending} style={{ backgroundColor: ACCENT }} onClick={() => evaluateMutation.mutate()}>
                  {evaluateMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : <Compass className="mr-1.5 size-4" aria-hidden="true" />}
                  Evaluate Pathway
                </Button>
              )}
            </div>
          )
        }

        if (data.status === 'GENERATING') {
          return (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#ebebeb] bg-white p-10 text-center">
              <Loader2 className="size-8 animate-spin" style={{ color: ACCENT }} aria-hidden="true" />
              <p className="text-sm text-[#5c5c5c]">Evaluating all 20 P-rules and resolving precedence…</p>
            </div>
          )
        }

        if (data.status === 'FAILED') {
          return (
            <ErrorState title="Pathway evaluation failed" description={data.errorMessage ?? 'An unknown error occurred while evaluating this pathway.'}>
              <Button size="sm" variant="outline" disabled={evaluateMutation.isPending} onClick={() => evaluateMutation.mutate()}>
                {evaluateMutation.isPending ? 'Retrying…' : 'Retry'}
              </Button>
            </ErrorState>
          )
        }

        const decision = data

        return (
          <div className="flex flex-col gap-4">
            <PathwayHero decision={decision} onEvaluate={() => reassessMutation.mutate()} evaluating={reassessMutation.isPending} />

            <div className="rounded-2xl border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]">
              <p className="mb-2 text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Customer-safe explanation</p>
              {decision.customerReasons.map((r, i) => (
                <p key={i} className={i === 0 ? 'text-sm font-medium text-[#171717]' : 'mt-1 text-xs text-[#5c5c5c]'}>
                  {r.text}
                </p>
              ))}
            </div>

            {decision.internalReasons && decision.internalReasons.length > 0 && (
              <div className="rounded-2xl border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]">
                <p className="mb-2 text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Internal reasons (CCR only)</p>
                <ul className="flex flex-col gap-1">
                  {decision.internalReasons.map((r, i) => (
                    <li key={i} className="text-xs text-[#5c5c5c]">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {decision.alternatives && decision.alternatives.length > 0 && (
              <div className="rounded-2xl border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]">
                <p className="mb-2 text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Alternative pathways (§8)</p>
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                  {decision.alternatives.map((alt) => (
                    <AlternativeRow key={alt.pathway} alt={alt} />
                  ))}
                </div>
              </div>
            )}

            {decision.pathwayStatus === 'READY' && (
              <div className="rounded-2xl border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Pathway TTL</p>
                  <span className="text-xs text-[#5c5c5c]">{decision.ttl.liveStatus}</span>
                </div>
                <p className="mt-1 text-sm text-[#171717]">{decision.ttl.pathwayTtlDays} days — expires {decision.ttl.expiresAt ? new Date(decision.ttl.expiresAt).toLocaleDateString() : 'n/a'}</p>
              </div>
            )}

            <div className="rounded-2xl border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]">
              <p className="mb-1 text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Rule evaluation (P001-P020)</p>
              <div className="flex flex-col">
                {decision.ruleResults.map((r) => (
                  <RuleRow key={r.ruleId} rule={r} />
                ))}
              </div>
            </div>

            {historyQuery.data && historyQuery.data.length > 1 && (
              <div className="rounded-2xl border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]">
                <p className="mb-2 text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Decision history</p>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[#a3a3a3]">
                      <th className="pb-1 font-normal">Version</th>
                      <th className="pb-1 font-normal">Pathway</th>
                      <th className="pb-1 font-normal">Status</th>
                      <th className="pb-1 font-normal">Generated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyQuery.data.map((h: PathwayDecisionHistoryEntry) => (
                      <tr key={h.version} className="border-t border-[#f0f0f0]">
                        <td className="py-1">v{h.version}</td>
                        <td className="py-1">{h.primaryPathway ?? '—'}</td>
                        <td className="py-1">{h.pathwayStatus ?? '—'}</td>
                        <td className="py-1">{h.generatedAt ? new Date(h.generatedAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      }}
    </QueryBoundary>
  )
}
