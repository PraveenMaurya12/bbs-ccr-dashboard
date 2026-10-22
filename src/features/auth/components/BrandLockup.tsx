import brandMark from '@/assets/logo/brand-mark.svg'
import tagline from '@/assets/logo/tagline.svg'
import wordmark from '@/assets/logo/wordmark.svg'
import { cn } from '@/lib/utils'

/**
 * Icon + wordmark + tagline lockup, matching the Figma "Brand Items [Atomic]"
 * component at its natural (fixed-px) size. Used in normal document flow —
 * the scaled variant used over the promo illustration lives in PromoPanel,
 * where it must track the responsive image size instead.
 */
export function BrandLockup({
  className,
  iconClassName,
  dark,
}: {
  className?: string
  /** Overrides the icon's default `size-8` — e.g. the sidebar header uses `size-10` per Figma. */
  iconClassName?: string
  /**
   * `wordmark.svg`/`tagline.svg` are solid `#171717` fills — correct on the
   * light surfaces they were designed for (PromoPanel, login), invisible on
   * a near-black one. No separate light-on-dark asset exists in the brand
   * asset set, so on a dark surface this inverts the same authentic vector
   * files to render near-white instead of swapping in a different asset —
   * `brand-mark`'s own gradient "B" mark is intentionally excluded from the
   * filter (it already reads correctly on any background).
   */
  dark?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div className={cn('relative shrink-0', iconClassName ?? 'size-8')}>
        <img
          src={brandMark}
          alt=""
          aria-hidden="true"
          className="absolute inset-[8.33%] size-[83.34%]"
        />
      </div>
      <div className={cn('flex flex-col items-end gap-[3.332px]', dark && 'brightness-0 invert')}>
        <img src={wordmark} alt="Bade Bhaisab" className="h-[15.922px] w-[146.667px]" />
        <img src={tagline} alt="" aria-hidden="true" className="h-[4.747px] w-[146.667px]" />
      </div>
    </div>
  )
}
