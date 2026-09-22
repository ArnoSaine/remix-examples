import { clientEntry, css, on, type Handle } from 'remix/component'

import {
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './locales.ts'
import { setLocale } from './localization.ts'

interface LocaleSelectProps {
  locale: SupportedLocale
}

function getLocaleLabel(locale: SupportedLocale) {
  let language = new Intl.Locale(locale).language
  return new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language
}

export const LocaleSelect = clientEntry(
  import.meta.url,
  function LocaleSelect(handle: Handle<LocaleSelectProps>) {
    let locale = handle.props.locale
    return () => (
      <div mix={controlStyle}>
        <label for="locale-select" mix={labelStyle} data-l10n-id="locale-select">
          Language
        </label>
        <select
          id="locale-select"
          mix={[
            selectStyle,
            on('change', async (event) => {
              locale = (event.target as HTMLSelectElement).value as SupportedLocale
              handle.update()
              await setLocale(locale)
              document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`
            }),
          ]}
          value={locale}
        >
          {SUPPORTED_LOCALES.map((locale) => (
            <option label={getLocaleLabel(locale)} mix={optionStyle} value={locale} />
          ))}
        </select>
      </div>
    )
  },
)

const controlStyle = css({
  alignSelf: 'flex-end',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
})

const labelStyle = css({
  color: 'var(--text-tertiary)',
  fontSize: '10px',
  fontWeight: 700,
  lineHeight: 1.2,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
})

const selectStyle = css({
  minWidth: '116px',
  minHeight: '36px',
  border: '1px solid transparent',
  color: 'var(--text-primary)',
  background: 'var(--surface-4)',
  font: 'inherit',
})

const optionStyle = css({
  font: 'inherit',
})
