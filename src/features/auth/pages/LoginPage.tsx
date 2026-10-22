import { BrandLockup } from '@/features/auth/components/BrandLockup'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { PromoPanel } from '@/features/auth/components/PromoPanel'

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-white p-2 xl:h-dvh xl:flex-row xl:overflow-hidden">
      {/* Split promo panel — desktop/wide-tablet only. Below xl this would
          either crush the form (see README/report) or force a stacked
          layout the design explicitly avoids, so it's hidden and replaced
          by the compact BrandLockup below instead. */}
      <div className="hidden shrink-0 xl:block xl:h-full" style={{ aspectRatio: '824 / 884' }}>
        <PromoPanel />
      </div>

      <div className="flex w-full flex-1 flex-col px-6 py-8 sm:px-10 xl:overflow-y-auto xl:p-11">
        <BrandLockup className="mx-auto xl:mx-0" />
        <div className="flex flex-1 items-center justify-center py-8">
          <LoginForm />
        </div>
        <p className="text-center text-sm leading-5 tracking-[-0.084px] text-[#5c5c5c] xl:text-left">
          © 2025 bade bhaisab
        </p>
      </div>
    </div>
  )
}
