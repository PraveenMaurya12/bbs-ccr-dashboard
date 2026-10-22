import { CheckCircle2, Circle, Loader2 } from 'lucide-react'

import type { FinancialAnalysisStatus } from '../../../types'

const STAGES: { key: FinancialAnalysisStatus; label: string }[] = [
  { key: 'UPLOADED', label: 'Uploaded' },
  { key: 'EXTRACTING', label: 'Extracting' },
  { key: 'NORMALIZING', label: 'Normalizing' },
  { key: 'CLASSIFYING', label: 'Classifying' },
  { key: 'ANALYZING', label: 'Analyzing' },
]

/**
 * A real named-sub-stage stepper for the spec's own exact pipeline
 * lifecycle — no Debt Analysis equivalent exists, since a bureau pull has
 * no named sub-stages but this pipeline genuinely does (the backend
 * persists `status` after each stage transition, not just at the end).
 */
export function DocumentProcessingStatus({ status }: { status: FinancialAnalysisStatus }) {
  const currentIndex = STAGES.findIndex((s) => s.key === status)

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="flex w-full max-w-md items-center justify-between">
        {STAGES.map((stage, i) => {
          const isDone = i < currentIndex
          const isCurrent = i === currentIndex
          return (
            <div key={stage.key} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-center">
                {i > 0 && <div className={`h-px flex-1 ${isDone || isCurrent ? 'bg-[#335cff]' : 'bg-[#ebebeb]'}`} />}
                {isDone ? (
                  <CheckCircle2 className="size-5 shrink-0 text-[#1fc16b]" aria-hidden="true" />
                ) : isCurrent ? (
                  <Loader2 className="size-5 shrink-0 animate-spin text-[#335cff]" aria-hidden="true" />
                ) : (
                  <Circle className="size-5 shrink-0 text-[#d1d1d1]" aria-hidden="true" />
                )}
                {i < STAGES.length - 1 && <div className={`h-px flex-1 ${isDone ? 'bg-[#335cff]' : 'bg-[#ebebeb]'}`} />}
              </div>
              <p className={`text-xs ${isCurrent ? 'font-medium text-[#171717]' : 'text-[#a3a3a3]'}`}>{stage.label}</p>
            </div>
          )
        })}
      </div>
      <p className="text-sm text-[#5c5c5c]">
        {status === 'UPLOADED' && 'Preparing to process the uploaded statement…'}
        {status === 'EXTRACTING' && 'Extracting transactions from the statement file…'}
        {status === 'NORMALIZING' && 'Normalizing transaction dates, amounts, and directions…'}
        {status === 'CLASSIFYING' && 'Classifying transactions and detecting recurring patterns…'}
        {status === 'ANALYZING' && 'Computing the financial health score and risk flags…'}
      </p>
    </div>
  )
}
