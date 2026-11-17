import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, PhoneCall } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { EmptyState } from '@/components/shared/EmptyState'
import { QueryBoundary } from '@/components/shared/QueryBoundary'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/services/api/client'
import { ccrInteractionService } from '../../../services/ccrInteractionService'
import type { CcrInteractionState, CcrQuestionItem, CcrResponseStatus, CcrSubmitResult } from '../../../types'
import { SectionCard } from '../shared/SectionCard'
import { draftFromQuestion, draftsEqual, EMPTY_DRAFT, MAX_TEXT_LENGTH, toAnswerInput, validateDraft, type AnswerDraft } from './ccrAnswerDraft'

const RESPONSE_OPTIONS: { value: CcrResponseStatus; label: string }[] = [
  { value: 'ANSWERED', label: 'Answered' },
  { value: 'CUSTOMER_DECLINED', label: 'Customer declined' },
  { value: 'NOT_KNOWN', label: 'Not known' },
]

const SOURCE_LABEL = { L1_DEBT_ANALYSIS: 'L1 Credit Profile', L2_FINANCIAL_ANALYSIS: 'L2 Financial Profile', MASTER_PROFILE: 'Blocking items from the Master Profile' } as const

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return error.message || 'You do not have permission to change this lead’s CCR answers.'
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

type Notice = { kind: 'success' | 'error' | 'info'; text: string }

function NoticeBanner({ notice }: { notice: Notice }) {
  const tone =
    notice.kind === 'success' ? 'border-[#1fc16b]/30 bg-[#1fc16b]/5 text-[#0b6b3a]' : notice.kind === 'error' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-[#ebebeb] bg-[#f7f7f7] text-[#5c5c5c]'
  const Icon = notice.kind === 'success' ? CheckCircle2 : AlertTriangle
  return (
    <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${tone}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 whitespace-pre-line">{notice.text}</span>
    </div>
  )
}

function submitSummary(result: CcrSubmitResult): string {
  const lines = ['Interaction submitted.']
  for (const a of result.downstream.applied) {
    if (a.appliedTo) lines.push(`Monthly income copied to Lead Details (${a.appliedTo}).`)
    if (a.conflictNote) lines.push(a.conflictNote)
  }
  if (!result.downstream.masterProfile.generated) {
    lines.push(`The Master Profile was not regenerated: ${result.downstream.masterProfile.reason ?? 'unknown reason'}. Cohort, Pathway and Plan are out of date until it is.`)
  } else {
    lines.push('The Master Profile was regenerated with these answers.')
    const labels = { cohort: 'Cohort decision', pathway: 'Pathway', plan: 'Plan' } as const
    for (const stage of ['cohort', 'pathway', 'plan'] as const) {
      const r = result.downstream.recalculated?.[stage]
      if (!r) continue
      if ('skipped' in r) lines.push(`${labels[stage]}: not recalculated — ${r.reason}`)
      else lines.push(r.generated ? `${labels[stage]}: recalculated.` : `${labels[stage]}: could not be recalculated — ${r.reason ?? 'unknown reason'}`)
    }
    lines.push('Review the Final Profile and Recovery plan tabs. A plan is never approved automatically.')
  }
  return lines.join('\n')
}

function QuestionRow({ index, question, draft, error, disabled, onChange }: { index: number; question: CcrQuestionItem; draft: AnswerDraft; error: string | null; disabled: boolean; onChange: (next: AnswerDraft) => void }) {
  const idBase = `ccr-q-${question.key}`
  const saved = question.answer
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[#ebebeb] bg-white p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-xs font-medium text-[#a3a3a3]">{index}.</span>
        <label htmlFor={`${idBase}-status`} className="min-w-0 flex-1 text-sm text-[#171717]">
          {question.text}
        </label>
        {saved && <span className="shrink-0 rounded-full bg-[#1fc16b]/10 px-2 py-0.5 text-[11px] text-[#0b6b3a]">Saved</span>}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <select
          id={`${idBase}-status`}
          value={draft.responseStatus}
          disabled={disabled}
          aria-invalid={error !== null}
          onChange={(e) => onChange({ ...draft, responseStatus: e.target.value as CcrResponseStatus | '' })}
          className="h-9 rounded-md border bg-transparent px-2 text-sm sm:w-44"
        >
          <option value="">Select response…</option>
          {RESPONSE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {draft.responseStatus === 'ANSWERED' && question.answerType === 'AMOUNT' && (
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-sm text-[#5c5c5c]">
              ₹
            </span>
            <input
              id={`${idBase}-amount`}
              aria-label={`Amount in rupees for: ${question.text}`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={draft.amount}
              disabled={disabled}
              aria-invalid={error !== null}
              onChange={(e) => onChange({ ...draft, amount: e.target.value })}
              className="h-9 w-40 rounded-md border bg-transparent px-2 text-sm"
            />
          </div>
        )}

        {draft.responseStatus === 'ANSWERED' && question.answerType === 'YES_NO' && (
          <div role="radiogroup" aria-label={`Yes or no: ${question.text}`} className="flex gap-2">
            {([true, false] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={draft.yesNo === value}
                disabled={disabled}
                onClick={() => onChange({ ...draft, yesNo: value })}
                className={`h-9 rounded-md border px-4 text-sm ${draft.yesNo === value ? 'border-[#335cff] bg-[#335cff]/10 text-[#335cff]' : 'text-[#5c5c5c]'}`}
              >
                {value ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
        )}

        {draft.responseStatus === 'ANSWERED' && question.answerType === 'TEXT' && (
          <Textarea
            aria-label={`Answer for: ${question.text}`}
            value={draft.text}
            disabled={disabled}
            maxLength={MAX_TEXT_LENGTH}
            rows={2}
            aria-invalid={error !== null}
            onChange={(e) => onChange({ ...draft, text: e.target.value })}
            className="min-w-0 flex-1"
          />
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {saved?.appliedTo && <p className="text-xs text-[#0b6b3a]">Applied to {saved.appliedTo}.</p>}
      {saved?.conflictNote && <p className="text-xs text-[#b25e09]">{saved.conflictNote}</p>}
    </li>
  )
}

function CcrInteractionBody({ bbsLeadId, data }: { bbsLeadId: string; data: CcrInteractionState }) {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({})
  const [showErrors, setShowErrors] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  // A row shows the user's draft if they have touched it, otherwise what the server has saved.
  const draftFor = (q: CcrQuestionItem): AnswerDraft => drafts[q.key] ?? draftFromQuestion(q)

  const dirty = data.questions.filter((q) => drafts[q.key] !== undefined && !draftsEqual(drafts[q.key] ?? EMPTY_DRAFT, draftFromQuestion(q)))
  const errors = Object.fromEntries(data.questions.map((q) => [q.key, validateDraft(q, draftFor(q))]))
  const dirtyInvalid = dirty.filter((q) => errors[q.key] != null)

  const invalidateDownstream = () => {
    for (const key of ['masterProfile', 'cohortDecision', 'pathwayDecision', 'bbsPlan', 'cohortRefreshTriggers']) queryClient.invalidateQueries({ queryKey: [key, bbsLeadId] })
    queryClient.invalidateQueries({ queryKey: ['leadDetail', bbsLeadId] })
  }

  const saveMutation = useMutation({
    mutationFn: (questions: CcrQuestionItem[]) => ccrInteractionService.saveAnswers(bbsLeadId, questions.map((q) => toAnswerInput(q, draftFor(q)))),
    onSuccess: (state, questions) => {
      queryClient.setQueryData(['ccrInteraction', bbsLeadId], state)
      // Saved rows now live on the server; forget their local drafts so the server value is shown again.
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([key]) => !questions.some((q) => q.key === key))))
      setShowErrors(false)
      setNotice({ kind: 'success', text: `Saved ${questions.length} answer${questions.length === 1 ? '' : 's'}.${state.status === 'DRAFT' && data.status === 'SUBMITTED' ? ' This interaction was reopened and must be submitted again.' : ''}` })
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error) }),
  })

  const submitMutation = useMutation({
    mutationFn: () => ccrInteractionService.submit(bbsLeadId),
    onSuccess: (result) => {
      queryClient.setQueryData(['ccrInteraction', bbsLeadId], result)
      setNotice({ kind: 'success', text: submitSummary(result) })
      invalidateDownstream()
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error) }),
  })

  const busy = saveMutation.isPending || submitMutation.isPending

  function handleSave() {
    setNotice(null)
    if (dirty.length === 0) return setNotice({ kind: 'info', text: 'There are no unsaved changes.' })
    if (dirtyInvalid.length > 0) {
      setShowErrors(true)
      return setNotice({ kind: 'error', text: `Fix ${dirtyInvalid.length} answer${dirtyInvalid.length === 1 ? '' : 's'} before saving.` })
    }
    saveMutation.mutate(dirty)
  }

  async function handleSubmit() {
    setNotice(null)
    if (dirtyInvalid.length > 0) {
      setShowErrors(true)
      return setNotice({ kind: 'error', text: `Fix ${dirtyInvalid.length} answer${dirtyInvalid.length === 1 ? '' : 's'} before submitting.` })
    }
    const unanswered = data.questions.filter((q) => draftFor(q).responseStatus === '')
    if (unanswered.length > 0) {
      setShowErrors(true)
      return setNotice({ kind: 'error', text: `${unanswered.length} question${unanswered.length === 1 ? ' still needs' : 's still need'} a response before this can be submitted.` })
    }
    try {
      if (dirty.length > 0) await saveMutation.mutateAsync(dirty)
      await submitMutation.mutateAsync()
    } catch {
      // Both mutations already surface their own error notice.
    }
  }

  const grouped = (['MASTER_PROFILE', 'L1_DEBT_ANALYSIS', 'L2_FINANCIAL_ANALYSIS'] as const).map((source) => ({ source, questions: data.questions.filter((q) => q.source === source) })).filter((g) => g.questions.length > 0)
  const answeredNow = data.questions.filter((q) => draftFor(q).responseStatus !== '').length
  const submitted = data.status === 'SUBMITTED' && dirty.length === 0

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        icon={PhoneCall}
        title="CCR verification questions"
        action={
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${data.status === 'SUBMITTED' ? 'bg-[#1fc16b]/10 text-[#0b6b3a]' : 'bg-[#f7f7f7] text-[#5c5c5c]'}`}>
            {data.status === 'SUBMITTED' ? 'Submitted' : 'Draft'}
          </span>
        }
      >
        <p className="text-sm text-[#5c5c5c]">
          Questions generated from this lead’s L1 Credit Profile and L2 Financial Profile. Record what the customer says — choose “Not known” or “Customer declined” rather than guessing. Answers are saved
          per lead and used when the Master Profile is regenerated.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#171717]" aria-live="polite">
            {answeredNow} of {data.questions.length} answered{dirty.length > 0 ? ` · ${dirty.length} unsaved` : ''}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy || dirty.length === 0} onClick={handleSave}>
              {saveMutation.isPending && !submitMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : null}
              Save answers
            </Button>
            <Button size="sm" disabled={busy || submitted || answeredNow < data.questions.length} onClick={handleSubmit}>
              {submitMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : null}
              {submitted ? 'Submitted' : 'Submit interaction'}
            </Button>
          </div>
        </div>
        {notice && <NoticeBanner notice={notice} />}
      </SectionCard>

      {grouped.map((group) => (
        <SectionCard key={group.source} icon={ClipboardList} title={`${SOURCE_LABEL[group.source]} (${group.questions.length})`}>
          <ol className="flex flex-col gap-3">
            {group.questions.map((q, i) => (
              <QuestionRow
                key={q.key}
                index={i + 1}
                question={q}
                draft={draftFor(q)}
                error={showErrors || drafts[q.key] !== undefined ? (errors[q.key] ?? null) : null}
                disabled={busy}
                onChange={(next) => setDrafts((d) => ({ ...d, [q.key]: next }))}
              />
            ))}
          </ol>
        </SectionCard>
      ))}

      {data.retiredAnswers.length > 0 && (
        <SectionCard title={`Earlier answers no longer asked (${data.retiredAnswers.length})`}>
          <p className="text-xs text-[#a3a3a3]">The lead’s analyses changed, so these questions are no longer generated. The answers are kept for reference.</p>
          <ul className="flex flex-col gap-2 text-sm text-[#5c5c5c]">
            {data.retiredAnswers.map((a) => (
              <li key={a.questionKey}>
                <span className="text-[#171717]">{a.questionText}</span> —{' '}
                {a.responseStatus === 'ANSWERED' ? (a.answerText ?? (a.answerAmount !== null ? `₹${a.answerAmount}` : a.answerBoolean === null ? '' : a.answerBoolean ? 'Yes' : 'No')) : a.responseStatus === 'NOT_KNOWN' ? 'Not known' : 'Customer declined'}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}

export function CcrInteractionTab({ bbsLeadId }: { bbsLeadId: string }) {
  const query = useQuery({ queryKey: ['ccrInteraction', bbsLeadId], queryFn: () => ccrInteractionService.get(bbsLeadId) })

  return (
    <QueryBoundary query={query}>
      {(data) =>
        data.questionsAvailable ? (
          <CcrInteractionBody key={bbsLeadId} bbsLeadId={bbsLeadId} data={data} />
        ) : (
          <EmptyState title="No CCR questions yet" description={data.unavailableReason ?? 'Questions appear here once the L1 Credit Profile and L2 Financial Profile have completed.'} />
        )
      }
    </QueryBoundary>
  )
}
