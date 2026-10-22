/**
 * A plain div-based horizontal bar — matches the hand-rolled stacked-bar
 * style already used by DebtBurdenCard rather than pulling in a chart
 * library dependency for a simple proportional bar.
 */
export function ConcentrationBar({ segments }: { segments: Array<{ percent: number; color: string }> }) {
  return (
    <div className="flex h-2 w-full gap-1 overflow-hidden rounded-full bg-[#f7f7f7]">
      {segments.map((segment, i) => (
        <div
          key={i}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${Math.max(segment.percent, segment.percent > 0 ? 1 : 0)}%`, backgroundColor: segment.color }}
        />
      ))}
    </div>
  )
}
