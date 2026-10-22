import { CREDIT_SCORE_TIER_META, creditScoreTier } from '../utils/leadDisplay'

export function CreditScoreBadge({ score }: { score: number }) {
  const tier = creditScoreTier(score)
  const meta = CREDIT_SCORE_TIER_META[tier]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md py-1 pr-2 pl-1 text-xs font-medium ${meta.bgClassName} ${meta.textClassName}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {score}
    </span>
  )
}
