import { useState, type ComponentProps, type ReactNode } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, Lock, Mail, UserRound, type LucideIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { useAuth } from '@/features/auth/AuthProvider'
import { loginSchema, type LoginFormValues } from '@/features/auth/schema'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'
import { ApiError } from '@/services/api/client'

interface LocationState {
  from?: { pathname: string }
}

function IconInput({
  icon: Icon,
  trailing,
  className,
  ...props
}: ComponentProps<'input'> & {
  icon: LucideIcon
  trailing?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 rounded-[10px] border border-[#ebebeb] bg-white py-2.5 pr-2.5 pl-3 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]',
        'has-[input:focus-visible]:border-[#335cff] has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-[#335cff]/20',
        'has-[input[aria-invalid=true]]:border-destructive',
      )}
    >
      <Icon className="size-5 shrink-0 text-[#a3a3a3]" aria-hidden="true" />
      <input
        className={cn(
          'w-full flex-1 border-0 bg-transparent text-sm text-[#171717] outline-none placeholder:text-[#a3a3a3]',
          className,
        )}
        {...props}
      />
      {trailing}
    </div>
  )
}

export function LoginForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', keepLoggedIn: false },
  })

  async function onSubmit(values: LoginFormValues) {
    setAuthError(null)
    try {
      await login(values)
      const from = (location.state as LocationState | null)?.from?.pathname ?? '/dashboard'
      navigate(from, { replace: true })
    } catch (error) {
      // Keep the email the CCR already typed — only clear the password so
      // they don't have to retype everything after e.g. a typo.
      form.resetField('password')
      setAuthError(
        error instanceof ApiError
          ? error.message
          : 'Unable to log in right now. Please check your connection and try again.',
      )
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="flex w-full max-w-[392px] flex-col items-center gap-6"
      >
        <div className="flex w-full flex-col items-center gap-2">
          <div className="flex items-center justify-center rounded-full bg-gradient-to-b from-[rgba(113,119,132,0.1)] to-[rgba(113,119,132,0)] p-4">
            <div className="flex items-center justify-center rounded-full border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]">
              <UserRound className="size-8 text-[#a3a3a3]" aria-hidden="true" />
            </div>
          </div>
          <div className="flex w-full flex-col items-center gap-1 text-center">
            <h1 className="w-full text-2xl leading-8 font-bold tracking-[-0.12px] text-[#171717]">
              Welcome to CCR Dashboard
            </h1>
            <p className="w-full text-base leading-6 tracking-[-0.176px] text-[#5c5c5c]">
              Log in to access customer insights, credit reports, analysis and
              recovery plans.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3">
          <FormField
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <FormItem className="gap-1">
                <FormLabel className="text-sm font-medium text-[#171717]">
                  Email Address
                </FormLabel>
                <FormControl>
                  <IconInput
                    icon={Mail}
                    type="email"
                    autoComplete="email"
                    placeholder="hello@alignui.com"
                    aria-invalid={!!fieldState.error}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <FormItem className="gap-1">
                <FormLabel className="text-sm font-medium text-[#171717]">
                  Password
                </FormLabel>
                <FormControl>
                  <IconInput
                    icon={Lock}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••••"
                    aria-invalid={!!fieldState.error}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="text-[#a3a3a3] hover:text-[#5c5c5c]"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? (
                          <EyeOff className="size-5" aria-hidden="true" />
                        ) : (
                          <Eye className="size-5" aria-hidden="true" />
                        )}
                      </button>
                    }
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <FormField
            control={form.control}
            name="keepLoggedIn"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="border-[#ebebeb] data-[state=checked]:border-[#335cff] data-[state=checked]:bg-[#335cff]"
                  />
                </FormControl>
                <FormLabel className="text-sm font-normal text-[#171717]">
                  Keep me logged in
                </FormLabel>
              </FormItem>
            )}
          />
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-[#5c5c5c] underline underline-offset-2 hover:text-[#171717]"
          >
            Forgot password?
          </Link>
        </div>

        {authError ? (
          <p role="alert" className="text-destructive w-full text-sm">
            {authError}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="h-auto w-full rounded-[10px] bg-[#335cff] py-2.5 text-sm font-medium text-white hover:bg-[#2547d0]"
        >
          {form.formState.isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Logging in…
            </>
          ) : (
            'Login'
          )}
        </Button>

        {env.apiMode === 'mock' ? (
          <p className="sr-only" aria-live="polite">
            Mock authentication for development only — no real backend is connected.
          </p>
        ) : null}
      </form>
    </Form>
  )
}
