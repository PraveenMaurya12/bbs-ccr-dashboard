import { PieChart as PieChartIcon } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

import { CREDIT_SCORE_TIER_META, creditScoreTier, formatCurrencyInr } from '../../../utils/leadDisplay'
import type { DebtAnalysisReport } from '../../../types'
import { CardDivider, NotAvailable, SectionCard, Stat } from '../shared/SectionCard'

// Standard CIBIL/Experian/Equifax bureau score range in India — not a
// figure invented for this feature, just the fixed scale the gauge draws.
const SCORE_MIN = 300
const SCORE_MAX = 900

/**
 * Figma's gauge (node 1454:6955's "Gauge Bar" — three overlaid ellipse
 * layers literally named "Background"/"Sky"/"Blue") uses a fixed
 * blue→sky-blue arc regardless of score tier — confirmed against two
 * separate reference renders (a "Fair" example and a "Good" example both
 * show the same blue arc, only the badge text/color below it changes by
 * tier). The arc's own color is NOT tier-conditional; only the small
 * score-band badge underneath is.
 */
const GAUGE_BLUE = '#335cff'
const GAUGE_SKY = '#8db4ff'
const GAUGE_TRACK = '#ebebeb'
// The lighter "Sky" tail is a fixed fraction of the filled arc, matching
// the two-tone look in the reference renders — not tied to the score.
const GAUGE_SKY_TAIL_FRACTION = 0.15

function ScoreGauge({ score }: { score: number }) {
  const tier = creditScoreTier(score)
  const clamped = Math.min(SCORE_MAX, Math.max(SCORE_MIN, score))
  const filled = clamped - SCORE_MIN
  const remaining = SCORE_MAX - clamped
  const skyTail = filled * GAUGE_SKY_TAIL_FRACTION
  const data = [
    { name: 'blue', value: filled - skyTail },
    { name: 'sky', value: skyTail },
    { name: 'remaining', value: remaining },
  ]

  return (
    <div className="relative h-[166px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius="70%"
            outerRadius="100%"
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill={GAUGE_BLUE} />
            <Cell fill={GAUGE_SKY} />
            <Cell fill={GAUGE_TRACK} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1">
        <p className="text-[40px] leading-[48px] font-medium tracking-[-0.4px] text-[#171717]">{score}</p>
        <span
          className={`rounded-md px-2 py-1 text-xs font-medium ${CREDIT_SCORE_TIER_META[tier].bgClassName} ${CREDIT_SCORE_TIER_META[tier].textClassName}`}
        >
          {tier === 'good' ? 'Good' : tier === 'fair' ? 'Fair' : 'Poor'}
        </span>
      </div>
    </div>
  )
}

export function CreditProfileSummaryCard({ report }: { report: DebtAnalysisReport }) {
  const { creditProfile } = report

  return (
    <SectionCard icon={PieChartIcon} title="Credit profile summary">
      {creditProfile.creditScore === null ? (
        <NotAvailable reason="No credit score was reported for this lead." />
      ) : (
        <ScoreGauge score={creditProfile.creditScore} />
      )}
      <CardDivider />
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Total accounts" value={creditProfile.totalAccounts === null ? 'N/A' : String(creditProfile.totalAccounts)} />
        <Stat label="Active accounts" value={String(creditProfile.activeAccounts)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Stat
          label="Closed accounts"
          value={creditProfile.closedAccounts === null ? 'N/A' : String(creditProfile.closedAccounts)}
        />
        <Stat label="Defaulted accounts" value={String(creditProfile.defaultedAccounts)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Total outstanding" value={formatCurrencyInr(creditProfile.totalOutstanding)} />
        <Stat
          label="Total overdue"
          value={creditProfile.totalOverdue === null ? 'N/A' : formatCurrencyInr(creditProfile.totalOverdue)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Stat
          label="Recent enquiries"
          value={creditProfile.recentEnquiries === null ? 'N/A' : String(creditProfile.recentEnquiries)}
        />
      </div>
    </SectionCard>
  )
}
