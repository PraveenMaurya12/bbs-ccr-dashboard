import { CircleDollarSign, FileText, PieChart as PieChartIcon, ShoppingBag } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

import type { DebtRepaymentBehavior } from '../../../types'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

// Same fixed blue/sky gauge treatment as the Credit Profile Summary and
// Loan & Account Analysis gauges (node 1459:9019's "Gauge Bar" uses the
// identical "Background"/"Sky"/"Blue" ellipse layers) — the arc itself is
// not colored by whether the on-time percentage is good or bad; only the
// category badges below are.
const GAUGE_BLUE = '#335cff'
const GAUGE_SKY = '#8db4ff'
const GAUGE_TRACK = '#ebebeb'
const GAUGE_SKY_TAIL_FRACTION = 0.15

function OnTimeGauge({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent))
  const skyTail = clamped * GAUGE_SKY_TAIL_FRACTION
  const data = [
    { name: 'blue', value: clamped - skyTail },
    { name: 'sky', value: skyTail },
    { name: 'remaining', value: 100 - clamped },
  ]

  return (
    <div className="relative mx-auto h-[183px] w-[207px]">
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5">
        <p className="text-[32px] leading-10 font-medium tracking-[-0.16px] text-[#171717]">{percent}%</p>
        <p className="text-center text-xs font-medium text-[#5c5c5c]">On time payments</p>
      </div>
    </div>
  )
}

function CategoryBadge({
  icon: Icon,
  iconBgClassName,
  label,
  valueClassName,
  percent,
}: {
  icon: typeof ShoppingBag
  iconBgClassName: string
  label: string
  valueClassName: string
  percent: number
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-3">
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${iconBgClassName}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-xs text-[#5c5c5c]">{label}</p>
        <p className={`text-sm font-medium tracking-[-0.084px] ${valueClassName}`}>{percent}%</p>
      </div>
    </div>
  )
}

export function RepaymentBehaviorCard({ behavior }: { behavior: DebtRepaymentBehavior }) {
  if (!behavior.available) {
    return (
      <SectionCard icon={PieChartIcon} title="Repayment behavior">
        <NotAvailable reason="No month-by-month payment history was reported on any tradeline." />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={PieChartIcon} title="Repayment behavior">
      <OnTimeGauge percent={behavior.onTimePercent ?? 0} />
      <CardDivider />
      <div className="flex items-start gap-2">
        <CategoryBadge
          icon={ShoppingBag}
          iconBgClassName="bg-[#e3f7ec] text-[#1fc16b]"
          label="On time payments"
          valueClassName="text-[#1fc16b]"
          percent={behavior.onTimePercent ?? 0}
        />
        <div className="mt-4 h-8 w-px shrink-0 bg-[#ebebeb]" />
        <CategoryBadge
          icon={FileText}
          iconBgClassName="bg-[#fffaeb] text-[#f6b51e]"
          label="Delayed payments"
          valueClassName="text-[#f6b51e]"
          percent={behavior.delayedPercent ?? 0}
        />
        <div className="mt-4 h-8 w-px shrink-0 bg-[#ebebeb]" />
        <CategoryBadge
          icon={CircleDollarSign}
          iconBgClassName="bg-[#ffebec] text-[#fb3748]"
          label="Missed EMI"
          valueClassName="text-[#fb3748]"
          percent={behavior.missedPercent ?? 0}
        />
      </div>
      {behavior.increasingDelayTrend && (
        <p className="rounded-md bg-[#fff3eb] px-2.5 py-1.5 text-[10px] leading-4 text-[#fa7319]">
          Recent trend shown increasing delays in the last 6 months
        </p>
      )}
    </SectionCard>
  )
}
