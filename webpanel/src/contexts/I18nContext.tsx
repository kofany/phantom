import { createContext, useState, useCallback, ReactNode } from 'react'
import { Language, translations, TranslationKeys } from '../i18n'

type I18nContextType = {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string, params?: Record<string, string>) => string
}

export const I18nContext = createContext<I18nContextType | null>(null)

const STORAGE_KEY = 'phantom-lang'

function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return typeof current === 'string' ? current : undefined
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'pl' || stored === 'en') return stored
    const browserLang = navigator.language.split('-')[0]
    return browserLang === 'pl' ? 'pl' : 'en'
  })

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem(STORAGE_KEY, lang)
  }, [])

  const t = useCallback((key: string, params?: Record<string, string>): string => {
    const trans = translations[language] as TranslationKeys
    let value = getNestedValue(trans, key)

    if (!value) {
      const fallback = translations['en'] as TranslationKeys
      value = getNestedValue(fallback, key) || key
    }

    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        value = value!.replace(`{${k}}`, v)
      })
    }

    return value
  }, [language])

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  )
}
