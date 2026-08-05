/**
 * Détection de formulaire de connexion/inscription et remplissage — le script
 * injecté ici tourne DANS la page (via CDP, voir `ensurePasswordBridge` dans
 * viewManager.ts), remonte des évènements au main process via
 * `Runtime.addBinding`/`Runtime.bindingCalled` (canal page→main, PAS de
 * preload possible pour une page web ordinaire). Isolé de viewManager.ts
 * (script nettement plus gros que les shims existants) mais suit exactement
 * le même patron d'injection CDP que `GOOGLE_AUTH_SHIM`/`WEBSTORE_HOOK_SCRIPT`.
 *
 * Jamais de mot de passe en clair ne doit être conservé plus longtemps que le
 * temps strictement nécessaire à son traitement immédiat, ni ici ni côté main
 * — voir les commentaires de `ensurePasswordBridge`/`onPasswordBridgeEvent`.
 */

/** Nom du binding CDP (`Runtime.addBinding`) — devient une fonction globale
 * `window[PASSWORD_BRIDGE_BINDING]` dans la page, posée par CDP lui-même
 * (pas par ce script). Préfixé pour ne jamais entrer en collision avec une
 * variable de page réelle. */
export const PASSWORD_BRIDGE_BINDING = '__aetherPwBridge'

/** Nombre max de `submit-candidate` remontés pour UN chargement de page —
 * borne un site malveillant qui déclencherait la détection en boucle pour
 * spammer le popup « enregistrer ? » ou sonder par side-channel l'existence
 * d'identifiants déjà stockés (voir aussi le throttle côté main, ipc.ts). */
const MAX_SUBMITS_PER_LOAD = 5

/** Délai d'observation après une soumission SPA "armée" (Entrée/clic sur un
 * champ password rempli) avant d'abandonner silencieusement si la page ne
 * semble pas avoir réagi — voir le commentaire détaillé dans le script. */
const SPA_REACTION_TIMEOUT_MS = 1500

export const PASSWORD_CAPTURE_SCRIPT = `(() => {
  if (window.__aetherPwBridgeActive) return
  window.__aetherPwBridgeActive = true
  // V1 : frame principale uniquement — jamais de détection/autofill dans un
  // iframe (cross-origin ou non) tant qu'aucune validation d'origine dédiée
  // n'existe pour ce cas (risque de vol d'identifiants par un iframe tiers).
  if (window.top !== window.self) return

  const BINDING = ${JSON.stringify(PASSWORD_BRIDGE_BINDING)}
  const emit = (event) => {
    try {
      const fn = window[BINDING]
      if (typeof fn === 'function') fn(JSON.stringify(event))
    } catch {}
  }

  window.__aetherPwFields = window.__aetherPwFields || new Map()
  let fieldCounter = 0
  const idFor = (el) => {
    if (!el.__aetherPwId) {
      el.__aetherPwId = 'f' + (fieldCounter++)
      window.__aetherPwFields.set(el.__aetherPwId, el)
    }
    return el.__aetherPwId
  }

  const isVisible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none'
  }

  const rectOf = (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }

  const IDENTIFIER_SELECTOR =
    'input[type="email"], input[type="text"], input[autocomplete*="username" i], ' +
    'input[autocomplete*="email" i], input:not([type])'

  /** Champ identifiant associé à un champ password : dans le même <form> si
   * possible, sinon dans tout le document — le dernier candidat visible qui
   * PRÉCÈDE le champ password dans l'ordre du DOM (pas les coordonnées
   * écran, qui n'ont pas de rapport garanti avec l'ordre logique). */
  function findIdentifierField(passwordEl) {
    const form = passwordEl.closest('form')
    const scope = form || document
    const candidates = Array.from(scope.querySelectorAll(IDENTIFIER_SELECTOR)).filter(isVisible)
    let best = null
    for (const c of candidates) {
      // bit DOCUMENT_POSITION_FOLLOWING posé sur (c, passwordEl) signifie que
      // passwordEl suit c dans le document — donc c le précède.
      if (c.compareDocumentPosition(passwordEl) & Node.DOCUMENT_POSITION_FOLLOWING) best = c
    }
    return best
  }

  let submitsEmitted = 0
  const emitSubmitCandidate = (identifierEl, passwordEl, formSignature) => {
    if (submitsEmitted >= ${MAX_SUBMITS_PER_LOAD}) return
    submitsEmitted++
    emit({
      type: 'submit-candidate',
      identifierValue: identifierEl && identifierEl.value ? identifierEl.value : null,
      passwordValue: passwordEl.value,
      formSignature
    })
  }

  function wire(passwordEl) {
    if (passwordEl.__aetherPwWired) return
    passwordEl.__aetherPwWired = true
    const identifierEl = findIdentifierField(passwordEl)
    const pwId = idFor(passwordEl)
    const idId = identifierEl ? idFor(identifierEl) : null

    passwordEl.addEventListener('focus', () => {
      emit({ type: 'field-focus', fieldId: pwId, kind: 'password', pairFieldId: idId, rect: rectOf(passwordEl) })
    })
    passwordEl.addEventListener('blur', () => emit({ type: 'field-blur', fieldId: pwId }))
    if (identifierEl) {
      identifierEl.addEventListener('focus', () => {
        emit({ type: 'field-focus', fieldId: idId, kind: 'identifier', pairFieldId: pwId, rect: rectOf(identifierEl) })
      })
      identifierEl.addEventListener('blur', () => emit({ type: 'field-blur', fieldId: idId }))
    }

    // --- Soumission HTML classique --------------------------------------
    const form = passwordEl.closest('form')
    if (form) {
      // Phase capture : AVANT qu'un handler de la page ne fasse
      // preventDefault() + vide le champ (SPA qui utilise quand même un vrai
      // <form> pour la sémantique/accessibilité mais intercepte submit).
      form.addEventListener(
        'submit',
        () => {
          const sig = location.origin + '|form|' + (form.action || form.id || '')
          emitSubmitCandidate(identifierEl, passwordEl, sig)
        },
        true
      )
    }

    // --- Heuristique SPA (pas de <form> — un <form> réel, même intercepté
    // par la page via preventDefault, déclenche déjà 'submit' de façon
    // fiable en phase capture ci-dessus ; câbler AUSSI cette heuristique
    // dans ce cas doublerait l'évènement pour une seule vraie soumission). --
    // Armée par Entrée dans le champ password OU clic sur un bouton/élément
    // cliquable alors que le champ password est rempli. Une fois armée, on
    // observe pendant SPA_REACTION_TIMEOUT_MS si la page semble avoir
    // "réagi" (URL changée, champ retiré du DOM, ou vidé) — seulement dans
    // ce cas on remonte l'évènement ; sinon abandon silencieux (pas de faux
    // positif sur un simple Entrée qui ne soumet rien).
    if (!form) {
      let armed = null
      const arm = () => {
        if (!passwordEl.value) return
        armed = {
          identifierValue: identifierEl && identifierEl.value ? identifierEl.value : null,
          passwordValue: passwordEl.value,
          urlAtArm: location.href
        }
        setTimeout(() => {
          if (!armed) return
          const a = armed
          armed = null
          const stillPresent = document.contains(passwordEl)
          const reacted = location.href !== a.urlAtArm || !stillPresent || (stillPresent && passwordEl.value === '')
          if (reacted) {
            const sig = a.urlAtArm + '|spa'
            emitSubmitCandidate({ value: a.identifierValue }, { value: a.passwordValue }, sig)
          }
        }, ${SPA_REACTION_TIMEOUT_MS})
      }
      passwordEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') arm()
      })
      document.addEventListener(
        'click',
        (e) => {
          if (!passwordEl.value) return
          const target = e.target
          if (target && target.closest && target.closest('button, [type="submit"], [role="button"]')) arm()
        },
        true
      )
    }
  }

  const scan = () => {
    document.querySelectorAll('input[type="password"]').forEach((el) => {
      if (isVisible(el)) wire(el)
    })
  }
  scan()
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true })
})();`

export type PasswordBridgeEvent =
  | {
      type: 'field-focus'
      fieldId: string
      kind: 'identifier' | 'password'
      pairFieldId: string | null
      rect: { x: number; y: number; width: number; height: number }
    }
  | { type: 'field-blur'; fieldId: string }
  | { type: 'submit-candidate'; identifierValue: string | null; passwordValue: string; formSignature: string }

/** Parse le payload JSON brut reçu via `Runtime.bindingCalled` — jamais fait
 * confiance à sa forme sans validation (la page pourrait en théorie appeler
 * le binding elle-même avec n'importe quoi). Retourne `null` sur tout écart
 * par rapport à la forme attendue, silencieusement — jamais une exception
 * qui remonterait jusqu'à un point où le mot de passe pourrait finir loggué. */
export function parseBridgeEvent(rawPayload: string): PasswordBridgeEvent | null {
  let data: unknown
  try {
    data = JSON.parse(rawPayload)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const obj = data as Record<string, unknown>
  if (obj.type === 'field-focus') {
    if (typeof obj.fieldId !== 'string') return null
    if (obj.kind !== 'identifier' && obj.kind !== 'password') return null
    const rect = obj.rect as Record<string, unknown> | undefined
    if (
      !rect ||
      typeof rect.x !== 'number' ||
      typeof rect.y !== 'number' ||
      typeof rect.width !== 'number' ||
      typeof rect.height !== 'number'
    ) {
      return null
    }
    return {
      type: 'field-focus',
      fieldId: obj.fieldId,
      kind: obj.kind,
      pairFieldId: typeof obj.pairFieldId === 'string' ? obj.pairFieldId : null,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
  }
  if (obj.type === 'field-blur') {
    if (typeof obj.fieldId !== 'string') return null
    return { type: 'field-blur', fieldId: obj.fieldId }
  }
  if (obj.type === 'submit-candidate') {
    if (typeof obj.passwordValue !== 'string' || typeof obj.formSignature !== 'string') return null
    return {
      type: 'submit-candidate',
      identifierValue: typeof obj.identifierValue === 'string' ? obj.identifierValue : null,
      passwordValue: obj.passwordValue,
      formSignature: obj.formSignature
    }
  }
  return null
}

/** Script de remplissage main→page — utilise le setter natif de la
 * propriété `value` (pas une simple affectation) puis des évènements
 * `input`/`change` synthétiques : nécessaire pour que les frameworks JS
 * modernes (React contrôlé, Vue…) détectent la saisie, leurs listeners
 * internes n'étant jamais notifiés par une affectation directe. `fieldId`
 * fait référence à `window.__aetherPwFields`, posé par `PASSWORD_CAPTURE_SCRIPT`
 * — retourne une chaîne vide (script no-op) si `fieldId` est `null`. */
export function buildFillScript(fieldId: string | null, value: string): string {
  if (!fieldId) return ''
  return `(() => {
    const map = window.__aetherPwFields
    const el = map && map.get(${JSON.stringify(fieldId)})
    if (!el || !document.contains(el)) return
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set
    if (setter) setter.call(el, ${JSON.stringify(value)})
    else el.value = ${JSON.stringify(value)}
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })();`
}

/** Pages où la détection/autofill n'a jamais de sens — jamais de capture sur
 * les surfaces internes d'ÆTHER ou d'autres schémas non-web. */
export function isHttpOrHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
