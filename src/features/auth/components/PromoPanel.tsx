import brandMark from '@/assets/logo/brand-mark.svg'
import illustration from '@/assets/login/promo-illustration.png'
import tagline from '@/assets/logo/tagline.svg'
import wordmark from '@/assets/logo/wordmark.svg'

/**
 * Left promotional panel. The headline, feature list, illustration, and
 * floating dashboard cards are all part of a single flattened image in the
 * Figma source (an AI-generated composite) — only the brand lockup on top
 * is a live element. Positions below are expressed in `cqw` (percent of
 * this panel's own rendered width) so the overlay tracks the image exactly
 * at every supported viewport size, converted 1:1 from the Figma node's
 * pixel coordinates in its native 824px-wide box.
 */
export function PromoPanel() {
  return (
    <div
      className="relative h-full overflow-hidden rounded-2xl bg-[#f7f7f7]"
      style={{ aspectRatio: '824 / 884', containerType: 'inline-size' }}
    >
      <img
        src={illustration}
        alt="A BBS relationship manager reviewing a customer's credit score, outstanding balance, recovery plan progress, and financial trend together on a laptop"
        className="absolute inset-0 h-full w-full object-cover object-left"
      />

      {/* Soft backdrop behind the crisp vector logo, echoing the logo
          already baked into the illustration at this spot. */}
      <div
        className="absolute bg-gradient-to-r from-[#fefefe] to-[#fbfdfd]"
        style={{
          left: '6.675cqw',
          top: '4.369cqw',
          width: '34.709cqw',
          height: '8.374cqw',
        }}
      />
      <div
        className="absolute flex items-center"
        style={{ left: '8.374cqw', top: '5.947cqw', gap: '1.001cqw' }}
      >
        <div className="relative shrink-0" style={{ width: '5.34cqw', height: '5.34cqw' }}>
          <img src={brandMark} alt="" aria-hidden="true" className="absolute inset-[8.33%] size-[83.34%]" />
        </div>
        <div className="flex flex-col items-end" style={{ gap: '0.556cqw' }}>
          <img
            src={wordmark}
            alt="Bade Bhaisab"
            style={{ width: '24.499cqw', height: '2.657cqw' }}
          />
          <img
            src={tagline}
            alt=""
            aria-hidden="true"
            style={{ width: '24.499cqw', height: '0.792cqw' }}
          />
        </div>
      </div>
    </div>
  )
}
