/**
 * Hook de traduction — retourne une fonction `t(clé, vars?)`.
 * Interface ÆTHER en français uniquement (voir `i18n/index.ts`).
 */
import { translate } from '@/i18n'

export type TFunction = (key: string, vars?: Record<string, string | number>) => string

export function useT(): TFunction {
  return (key, vars) => translate('fr', key, vars)
}
