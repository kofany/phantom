import pl from './pl.json'
import en from './en.json'

export type Language = 'pl' | 'en'

export const translations = { pl, en }

export type TranslationKeys = typeof pl
