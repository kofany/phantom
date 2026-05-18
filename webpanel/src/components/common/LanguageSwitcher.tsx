import { useTranslation } from '../../hooks/useTranslation'

export function LanguageSwitcher() {
  const { language, setLanguage } = useTranslation()

  return (
    <div className="language-switcher">
      <button
        className={language === 'pl' ? 'active' : ''}
        onClick={() => setLanguage('pl')}
      >
        PL
      </button>
      <button
        className={language === 'en' ? 'active' : ''}
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
    </div>
  )
}
