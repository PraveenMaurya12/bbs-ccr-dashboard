/**
 * The top-level group heading used to split a lead-detail report tab (Financial
 * Analysis, Debt Analysis, …) into its required top-level sections, each matching
 * that module's own spec'd information hierarchy. Distinct from `SectionCard`, which
 * wraps one individual card — this heading sits above a GROUP of cards so a CCR
 * reviewer can scan the page's structure before drilling into any one card's
 * evidence. Shared across modules since it is a generic numbered-heading primitive,
 * not module-specific content.
 */
export function SectionGroupHeading({ step, title, description }: { step: number; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 px-1 pt-2">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#171717] text-xs font-semibold text-white">{step}</span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-[-0.2px] text-[#171717]">{title}</h2>
        {description && <p className="text-xs text-[#5c5c5c]">{description}</p>}
      </div>
    </div>
  )
}
