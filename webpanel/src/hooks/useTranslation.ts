import { useContext } from 'react'
import { I18nContext } from '../contexts/I18nContext'

export function useTranslation() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider')
  }
  return context
}
