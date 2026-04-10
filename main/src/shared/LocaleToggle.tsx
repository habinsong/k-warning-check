import type { UiLocale } from '@/shared/types'

interface LocaleToggleProps {
  locale: UiLocale
  onChange: (locale: UiLocale) => void
  className?: string
}

export function LocaleToggle({ locale, onChange, className = '' }: LocaleToggleProps) {
  return (
    <div className={`inline-flex rounded-full border border-slate-200 bg-white p-1 ${className}`.trim()}>
      {([
        ['ko', '한국어'],
        ['en', 'English'],
      ] as const).map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            locale === value ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
