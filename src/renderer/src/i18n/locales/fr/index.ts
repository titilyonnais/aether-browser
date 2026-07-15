/** Dictionnaire FR — fusion des sections. */
import { shell } from './shell'
import { settings } from './settings'
import { overlays } from './overlays'
import { focusCanvas } from './focusCanvas'
import { guide } from './guide'

export const fr: Record<string, string> = { ...shell, ...settings, ...overlays, ...focusCanvas, ...guide }
