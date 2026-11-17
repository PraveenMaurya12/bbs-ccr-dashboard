import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileUp, ListChecks, Loader2, RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { documentService } from '../../../services/documentService'
import { financialAnalysisService } from '../../../services/financialAnalysisService'
import { dataRequirementsService } from '../../../services/dataRequirementsService'
import type { BlockExplanation, DataRequirement, RecalculateAllResult, StageRecalcOutcome } from '../../../types'
import type { LeadDetailTabId } from '../LeadDetailTabs'
import { SectionCard } from '../shared/SectionCard'

const ACCEPTED = '.pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MAX_ANALYSIS_WAIT_MS = 3 * 60 * 1000

type Phase = 'idle' | 'uploading' | 'analysing' | 'recalculating'

const PHASE_LABEL: Record<Exclude<Phase, 'idle'>, string> = {
  uploading: 'Uploading the statement…',
  analysing: 'Analysing the statement…',
  recalculating: 'Recalculating Master Profile, Cohort, Pathway and Plan…',
}

const STAGE_LABEL = { cohort: 'Cohort decision', pathway: 'Pathway', plan: 'Plan (draft)' } as const

function stageText(o: StageRecalcOutcome): string {
  if ('skipped' in o) return o.reason === 'Already up to date.' ? 'already up to date' : `not run — ${o.reason}`
  return o.generated ? (o.reason ? `kept — ${o.reason}` : 'updated') : `could not be updated — ${o.reason ?? 'unknown reason'}`
}

function resultTone(r: RecalculateAllResult): 'ok' | 'partial' {
  return r.masterProfile.generated && r.stages && Object.values(r.stages).every((s) => !('skipped' in s) && s.generated) ? 'ok' : 'partial'
}

async function waitForFinancialAnalysis(bbsLeadId: string): Promise<'COMPLETED' | 'FAILED' | 'TIMED_OUT'> {
  const deadline = Date.now() + MAX_ANALYSIS_WAIT_MS
  while (Date.now() < deadline) {
    const r = await financialAnalysisService.getForLead(bbsLeadId)
    // A COMPLETED report is only the NEW one once the analysis row for the new upload exists; the server reports the
    // newest attempt's status first, so wait until it has left the in-progress states.
    if (r.reportAvailable && (r.status === 'COMPLETED' || r.status === 'FAILED')) {
      if (r.status === 'FAILED') return 'FAILED'
      if (!('latestUploadFailed' in r) || !r.latestUploadFailed) return 'COMPLETED'
      return 'FAILED'
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  return 'TIMED_OUT'
}

function BlockExplanationCard({ explanation }: { explanation: BlockExplanation }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#fb3748]/25 bg-[#fb3748]/5 p-3">
      <div>
        <p className="text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">Why there is no pathway · {explanation.code.replace(/_/g, ' ')}</p>
        <p className="text-sm font-medium text-[#171717]">{explanation.title}</p>
      </div>
      <p className="text-sm leading-6 text-[#171717]">{explanation.meaning}</p>
      <div>
        <p className="text-xs font-medium text-[#171717]">Why it happened for this customer</p>
        <ul className="mt-1 list-disc pl-5 text-xs leading-5 text-[#5c5c5c]">
          {explanation.whyThisLead.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-medium text-[#171717]">What to do</p>
        <ol className="mt-1 list-decimal pl-5 text-xs leading-5 text-[#5c5c5c]">
          {explanation.whatToDo.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ol>
      </div>
      <p className="text-xs text-[#5c5c5c]">
        <span className="font-medium text-[#171717]">Who can clear it: </span>
        {explanation.whoCanClear}
      </p>
      {explanation.alsoMatched.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[#171717]">Also matched (not extra blockers)</p>
          <p className="text-xs leading-5 text-[#5c5c5c]">These show where the case would likely go once the block above is cleared:</p>
          <ul className="mt-1 list-disc pl-5 text-xs leading-5 text-[#5c5c5c]">
            {explanation.alsoMatched.map((a) => (
              <li key={a.code}>{a.label}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function RequirementCard({ requirement, busy, onUpload, onOpenTab }: { requirement: DataRequirement; busy: boolean; onUpload: () => void; onOpenTab: (tab: LeadDetailTabId) => void }) {
  const blocking = requirement.severity === 'BLOCKING'
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[#ebebeb] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[#171717]">{requirement.title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${blocking ? 'bg-[#fb3748]/10 text-[#c0182a]' : 'bg-[#f7f7f7] text-[#5c5c5c]'}`}>{blocking ? 'Blocking' : 'Helps'}</span>
      </div>
      <p className="text-xs leading-5 text-[#5c5c5c]">{requirement.why}</p>
      {requirement.detail?.needed && (
        <p className="rounded-md bg-[#f7f7f7] px-2 py-1.5 text-xs text-[#171717]">
          <span className="font-medium">Needed: </span>
          {requirement.detail.needed}
        </p>
      )}
      {requirement.detail && (requirement.detail.fixableByNewStatement || requirement.detail.structural || requirement.detail.reflectTransactions) && (
        <dl className="flex flex-col gap-1 text-xs text-[#5c5c5c]">
          {requirement.detail.fixableByNewStatement && requirement.detail.fixableByNewStatement.length > 0 && (
            <div>
              <dt className="inline font-medium text-[#171717]">A current statement can clear: </dt>
              <dd className="inline">{requirement.detail.fixableByNewStatement.join(', ')}</dd>
            </div>
          )}
          {requirement.detail.structural && requirement.detail.structural.length > 0 && (
            <div>
              <dt className="inline font-medium text-[#171717]">Can’t be changed by adding data: </dt>
              <dd className="inline">{requirement.detail.structural.join(', ')}</dd>
            </div>
          )}
          {requirement.detail.reflectTransactions && requirement.detail.reflectTransactions.length > 0 && (
            <div>
              <dt className="inline font-medium text-[#171717]">Reflect the transactions themselves: </dt>
              <dd className="inline">{requirement.detail.reflectTransactions.join(', ')}</dd>
            </div>
          )}
        </dl>
      )}
      {requirement.action.type === 'UPLOAD_BANK_STATEMENT' && (
        <div>
          <Button size="sm" variant="outline" disabled={busy} onClick={onUpload}>
            <FileUp className="mr-1.5 size-4" aria-hidden="true" />
            {requirement.action.label}
          </Button>
        </div>
      )}
      {requirement.action.type === 'ANSWER_CCR_QUESTIONS' && (
        <div>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpenTab('call-details')}>
            {requirement.action.label}
          </Button>
        </div>
      )}
      {requirement.action.type === 'SUPERVISOR_REVIEW' && <p className="text-xs font-medium text-[#b25e09]">{requirement.action.label}</p>}
    </li>
  )
}

/**
 * Shown on the Final Profile and Recovery plan tabs whenever the profile can't be classified. States exactly what
 * data is missing (each item derived from the persisted Master Profile), lets the CCR supply it right here, and then
 * recalculates everything in order. The plan that results is an internal draft — it is never approved from here.
 */
export function DataRequirementsPanel({ bbsLeadId, onOpenTab }: { bbsLeadId: string; onOpenTab: (tab: LeadDetailTabId) => void }) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RecalculateAllResult | null>(null)

  const query = useQuery({ queryKey: ['dataRequirements', bbsLeadId], queryFn: () => dataRequirementsService.get(bbsLeadId) })

  const busy = phase !== 'idle'

  function refreshEverythingOnScreen() {
    for (const key of ['dataRequirements', 'masterProfile', 'cohortDecision', 'pathwayDecision', 'bbsPlan', 'ccrInteraction', 'financialAnalysis', 'debtAnalysis', 'cohortRefreshTriggers']) {
      queryClient.invalidateQueries({ queryKey: [key, bbsLeadId] })
    }
    queryClient.invalidateQueries({ queryKey: ['documents', bbsLeadId] })
  }

  async function recalculate() {
    setPhase('recalculating')
    try {
      const r = await dataRequirementsService.recalculateAll(bbsLeadId)
      setResult(r)
      queryClient.setQueryData(['dataRequirements', bbsLeadId], r.requirements)
      refreshEverythingOnScreen()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recalculation failed.')
    } finally {
      setPhase('idle')
    }
  }

  async function handleFile(file: File) {
    setError(null)
    setResult(null)
    try {
      setPhase('uploading')
      await documentService.upload(bbsLeadId, 'BANK_STATEMENT', file)
      setPhase('analysing')
      queryClient.invalidateQueries({ queryKey: ['financialAnalysis', bbsLeadId] })
      const outcome = await waitForFinancialAnalysis(bbsLeadId)
      if (outcome !== 'COMPLETED') {
        setPhase('idle')
        setError(outcome === 'FAILED' ? 'The statement was uploaded but could not be analysed — check the file (a PDF, CSV or XLSX bank statement) and try another.' : 'The statement is still being analysed. Try “Recalculate everything” in a minute.')
        refreshEverythingOnScreen()
        return
      }
      await recalculate()
    } catch (e) {
      setPhase('idle')
      setError(e instanceof Error ? e.message : 'Upload failed.')
    }
  }

  if (query.isPending) return null
  if (query.isError) return null
  const data = query.data
  if (!data.blocked && data.requirements.length === 0 && !data.blockExplanation && !result) return null

  return (
    <SectionCard icon={ListChecks} title="Data needed to complete this profile">
      {data.headline && <p className="text-sm text-[#171717]">{data.headline}</p>}
      {data.blockExplanation && <BlockExplanationCard explanation={data.blockExplanation} />}
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        aria-label="Upload bank statement"
        data-testid="requirements-upload-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void handleFile(file)
        }}
      />

      {data.requirements.length === 0 ? (
        <p className="text-sm text-[#5c5c5c]">No specific data is missing. Recalculate to refresh the profile.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.requirements.map((r) => (
            <RequirementCard key={r.code} requirement={r} busy={busy} onUpload={() => fileInput.current?.click()} onOpenTab={onOpenTab} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={busy} onClick={() => void recalculate()}>
          {phase === 'recalculating' ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-1.5 size-4" aria-hidden="true" />}
          Recalculate everything &amp; generate plan
        </Button>
        {phase !== 'idle' && (
          <span role="status" className="flex items-center gap-1.5 text-xs text-[#5c5c5c]">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {PHASE_LABEL[phase]}
          </span>
        )}
      </div>
      <p className="text-xs text-[#a3a3a3]">Uploading a statement here analyses it and recalculates automatically. The plan produced is an internal draft — it is never approved or sent to the customer from this screen.</p>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div role="status" className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${resultTone(result) === 'ok' ? 'border-[#1fc16b]/30 bg-[#1fc16b]/5 text-[#0b6b3a]' : 'border-[#ebebeb] bg-[#f7f7f7] text-[#5c5c5c]'}`}>
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{result.masterProfile.generated ? (result.masterProfile.reason === 'Already up to date.' ? 'Master Profile is already up to date.' : 'Master Profile regenerated.') : `Master Profile was not regenerated: ${result.masterProfile.reason ?? 'unknown reason'}`}</span>
            {result.stages &&
              (['cohort', 'pathway', 'plan'] as const).map((stage) => (
                <span key={stage}>
                  {STAGE_LABEL[stage]}: {stageText(result.stages![stage])}
                </span>
              ))}
            {result.requirements.requirements.length > 0 ? <span>Still needed: {result.requirements.requirements.map((r) => r.title).join('; ')}.</span> : <span>Nothing further is missing.</span>}
          </div>
        </div>
      )}
    </SectionCard>
  )
}
