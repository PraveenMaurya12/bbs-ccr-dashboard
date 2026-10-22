import { FileChartLine } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'

import type { DebtCreditHistory } from '../../../types'
import { formatDateOnly } from '../../../utils/leadDisplay'
import { CardDivider, NotAvailable, SectionCard } from '../shared/SectionCard'

function HistoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <p className="text-xs text-[#5c5c5c]">{label}</p>
      <p className="text-sm font-medium text-[#171717]">{value}</p>
    </div>
  )
}

export function CreditHistoryTrendCard({ history }: { history: DebtCreditHistory }) {
  return (
    <SectionCard icon={FileChartLine} title="Credit history & trend">
      <div className="flex items-center justify-between gap-2">
        <HistoryStat
          label="Length of credit history"
          value={history.lengthOfHistoryYears === null ? 'N/A' : `${history.lengthOfHistoryYears} years`}
        />
        <div className="h-8 w-px shrink-0 bg-[#ebebeb]" />
        <HistoryStat
          label="Oldest account"
          value={history.oldestAccountDate ? formatDateOnly(history.oldestAccountDate) : 'N/A'}
        />
        <div className="h-8 w-px shrink-0 bg-[#ebebeb]" />
        <HistoryStat
          label="Newest account"
          value={history.newestAccountDate ? formatDateOnly(history.newestAccountDate) : 'N/A'}
        />
      </div>
      <CardDivider />

      {history.monthlyDelinquencyTrend.length === 0 ? (
        <NotAvailable reason="No month-by-month payment history was reported to build a trend." />
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history.monthlyDelinquencyTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Bar dataKey="accountsWithDelinquency" radius={[4, 4, 0, 0]} className="fill-[#335cff]" />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-[#a3a3a3]">Accounts reporting a late/missed payment, per month.</p>
        </div>
      )}
    </SectionCard>
  )
}
