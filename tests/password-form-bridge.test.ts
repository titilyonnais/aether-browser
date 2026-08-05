/**
 * Tests des fonctions pures du bridge mots de passe (aucune dépendance
 * Electron/CDP réelle) — parsing défensif des évènements remontés par la
 * page (jamais de confiance aveugle dans leur forme), et le script de
 * remplissage main→page.
 */
import { describe, expect, it } from 'vitest'
import { buildFillScript, isHttpOrHttpsUrl, parseBridgeEvent } from '../src/main/passwordFormBridge'

describe('parseBridgeEvent', () => {
  it('parse un field-focus valide', () => {
    const raw = JSON.stringify({
      type: 'field-focus',
      fieldId: 'f0',
      kind: 'password',
      pairFieldId: 'f1',
      rect: { x: 10, y: 20, width: 100, height: 30 }
    })
    expect(parseBridgeEvent(raw)).toEqual({
      type: 'field-focus',
      fieldId: 'f0',
      kind: 'password',
      pairFieldId: 'f1',
      rect: { x: 10, y: 20, width: 100, height: 30 }
    })
  })

  it('parse un field-focus sans pairFieldId (null)', () => {
    const raw = JSON.stringify({
      type: 'field-focus',
      fieldId: 'f0',
      kind: 'identifier',
      pairFieldId: null,
      rect: { x: 0, y: 0, width: 1, height: 1 }
    })
    const parsed = parseBridgeEvent(raw)
    expect(parsed && parsed.type === 'field-focus' && parsed.pairFieldId).toBeNull()
  })

  it('parse un field-blur valide', () => {
    expect(parseBridgeEvent(JSON.stringify({ type: 'field-blur', fieldId: 'f0' }))).toEqual({
      type: 'field-blur',
      fieldId: 'f0'
    })
  })

  it('parse un submit-candidate valide, identifierValue null accepté', () => {
    const raw = JSON.stringify({
      type: 'submit-candidate',
      identifierValue: null,
      passwordValue: 'hunter2',
      formSignature: 'https://example.com|form|'
    })
    expect(parseBridgeEvent(raw)).toEqual({
      type: 'submit-candidate',
      identifierValue: null,
      passwordValue: 'hunter2',
      formSignature: 'https://example.com|form|'
    })
  })

  it('rejette un JSON invalide sans lever d’exception', () => {
    expect(() => parseBridgeEvent('{not json')).not.toThrow()
    expect(parseBridgeEvent('{not json')).toBeNull()
  })

  it('rejette un type inconnu', () => {
    expect(parseBridgeEvent(JSON.stringify({ type: 'something-else' }))).toBeNull()
  })

  it('rejette un submit-candidate sans passwordValue (forme invalide)', () => {
    expect(parseBridgeEvent(JSON.stringify({ type: 'submit-candidate', identifierValue: 'x' }))).toBeNull()
  })

  it('rejette un field-focus avec un rect incomplet', () => {
    const raw = JSON.stringify({ type: 'field-focus', fieldId: 'f0', kind: 'password', rect: { x: 0 } })
    expect(parseBridgeEvent(raw)).toBeNull()
  })

  it('rejette un field-focus avec un kind invalide', () => {
    const raw = JSON.stringify({
      type: 'field-focus',
      fieldId: 'f0',
      kind: 'bogus',
      rect: { x: 0, y: 0, width: 1, height: 1 }
    })
    expect(parseBridgeEvent(raw)).toBeNull()
  })

  it('rejette une chaîne JSON valide mais pas un objet (ex. juste un nombre)', () => {
    expect(parseBridgeEvent('42')).toBeNull()
  })
})

describe('buildFillScript', () => {
  it('retourne une chaîne vide (no-op) si fieldId est null', () => {
    expect(buildFillScript(null, 'hunter2')).toBe('')
  })

  it('injecte le fieldId et la valeur en JSON sérialisé (échappement sûr)', () => {
    const script = buildFillScript('f0', 'a"b\\c')
    expect(script).toContain(JSON.stringify('f0'))
    expect(script).toContain(JSON.stringify('a"b\\c'))
    expect(script).toContain('__aetherPwFields')
    expect(script).toContain("dispatchEvent(new Event('input'")
    expect(script).toContain("dispatchEvent(new Event('change'")
  })
})

describe('isHttpOrHttpsUrl', () => {
  it('accepte http/https', () => {
    expect(isHttpOrHttpsUrl('https://example.com')).toBe(true)
    expect(isHttpOrHttpsUrl('http://example.com')).toBe(true)
  })

  it('rejette les schémas internes/non-web', () => {
    expect(isHttpOrHttpsUrl('aether://newtab')).toBe(false)
    expect(isHttpOrHttpsUrl('chrome://settings')).toBe(false)
    expect(isHttpOrHttpsUrl('file:///C:/x.html')).toBe(false)
    expect(isHttpOrHttpsUrl('chrome-extension://abc/popup.html')).toBe(false)
  })

  it('rejette une URL invalide sans lever d’exception', () => {
    expect(() => isHttpOrHttpsUrl('not a url')).not.toThrow()
    expect(isHttpOrHttpsUrl('not a url')).toBe(false)
  })
})
