/** Traductions FR — section "guide". */
export const guide: Record<string, string> = {
  // GuideOverlay
  'guide.guideOverlay.header.title': 'Comment ÆTHER fonctionne',
  'guide.guideOverlay.header.subtitle': "Pas d’onglets — des intentions, des cartes, une mémoire à vous.",

  'guide.guideOverlay.zones.intent.name': 'Barre d’Intention',
  'guide.guideOverlay.zones.intent.role': 'Le point de départ de tout',
  'guide.guideOverlay.zones.intent.detail':
    "Tapez une adresse, une recherche, ou une phrase entière (« compare X et Y », « résume cette page »). ÆTHER devine et agit. C’est l’équivalent de la barre d’adresse — en plus intelligent.",

  'guide.guideOverlay.zones.constellation.name': 'Constellation',
  'guide.guideOverlay.zones.constellation.role': 'Vos espaces + la carte du ciel',
  'guide.guideOverlay.zones.constellation.detail':
    'À gauche : vos espaces de travail (comme des bureaux séparés) et, en dessous, chaque page ouverte sous forme d’étoile. Les traits relient les pages ouvertes l’une depuis l’autre ; les pointillés, les pages proches par le sens.',

  'guide.guideOverlay.zones.focus.name': 'Mode Focus',
  'guide.guideOverlay.zones.focus.role': 'Lire, une ou deux pages',
  'guide.guideOverlay.zones.focus.detail':
    'La vue par défaut : une page plein cadre, ou deux côte à côte (vue scindée). C’est ici que vous naviguez réellement. Le séparateur central se glisse pour ajuster.',

  'guide.guideOverlay.zones.canvas.name': 'Toile spatiale',
  'guide.guideOverlay.zones.canvas.role': 'Penser, toutes vos pages',
  'guide.guideOverlay.zones.canvas.detail':
    'Une table infinie où chaque page devient une carte déplaçable. Molette pour vous promener, Ctrl+molette pour zoomer, double-clic pour poser une nouvelle carte. Double-cliquez une carte pour l’ouvrir en Focus.',

  'guide.guideOverlay.zones.muse.name': 'Muse',
  'guide.guideOverlay.zones.muse.role': 'Votre compagnon de pensée',
  'guide.guideOverlay.zones.muse.detail':
    'À droite : une IA qui voit la page active et votre sélection. Elle résume, compare, questionne. Locale par défaut (Ollama) ou via votre clé API — réglable dans les paramètres.',

  'guide.guideOverlay.gesturesTitle': 'Gestes & raccourcis',
  'guide.guideOverlay.gestures.openIntent': 'Ouvrir la barre d’Intention',
  'guide.guideOverlay.gestures.toggleFocusCanvas': 'Basculer Focus ⟷ Toile',
  'guide.guideOverlay.gestures.toggleConstellation': 'Afficher / masquer la Constellation',
  'guide.guideOverlay.gestures.toggleMuse': 'Afficher / masquer Muse',
  'guide.guideOverlay.gestures.closeTab': 'Fermer la page active',
  'guide.guideOverlay.gestures.reload': 'Recharger la page',
  'guide.guideOverlay.gestures.navigate': 'Reculer / avancer',
  'guide.guideOverlay.gestures.reopenGuide': 'Rouvrir ce guide',

  'guide.guideOverlay.chromiumTitle': 'Pages internes (Chromium)',
  'guide.guideOverlay.chromium.intro': 'ÆTHER tourne sur le moteur Chromium. Les diagnostics',
  'guide.guideOverlay.chromium.middle': 'du moteur sont accessibles ci-dessous. En revanche',
  'guide.guideOverlay.chromium.or': 'ou',
  'guide.guideOverlay.chromium.outro':
    'appartiennent à Google Chrome (le produit) et n’existent pas ici — les réglages d’ÆTHER en tiennent lieu.',

  'guide.guideOverlay.footer.replay': 'Revoir l’introduction',
  'guide.guideOverlay.footer.gotIt': 'J’ai compris',

  // CoachMarks
  'guide.coachMarks.marks.intent.title': '1 · La barre d’Intention',
  'guide.coachMarks.marks.intent.text':
    'Tout commence ici, en haut. Une adresse, une recherche ou une phrase — appuyez sur Ctrl+K n’importe quand pour l’ouvrir en grand.',
  'guide.coachMarks.marks.constellation.title': '2 · La Constellation',
  'guide.coachMarks.marks.constellation.text':
    'À gauche : vos espaces de travail et la carte de vos pages. Chaque page ouverte y devient une étoile.',
  'guide.coachMarks.marks.focusCanvas.title': '3 · Focus ou Toile',
  'guide.coachMarks.marks.focusCanvas.text':
    'Basculez entre lire une page plein cadre (Focus) et étaler toutes vos pages en cartes sur une toile infinie (Toile). Raccourci : Ctrl+E.',
  'guide.coachMarks.marks.muse.title': '4 · Muse',
  'guide.coachMarks.marks.muse.text':
    'À droite, votre compagnon IA. Il lit la page active pour vous aider à résumer, comparer, réfléchir.',
  'guide.coachMarks.skip': 'Passer',
  'guide.coachMarks.next': 'Suivant',
  'guide.coachMarks.finish': 'Terminer',

  // Onboarding
  'guide.onboarding.welcome.title': 'Bienvenue dans ÆTHER',
  'guide.onboarding.welcome.introA': "Un espace de pensée et d’action pour le web. Ici, pas d’onglets : des",
  'guide.onboarding.welcome.introEm1': 'intentions',
  'guide.onboarding.welcome.introB': ', des',
  'guide.onboarding.welcome.introEm2': 'cartes',
  'guide.onboarding.welcome.introC':
    ' arrangées dans des espaces calmes, et une mémoire qui vous appartient.',

  'guide.onboarding.intention.placeholderExample': 'compare rust et zig pour un jeu…',
  'guide.onboarding.intention.title': 'La Barre d’Intention',
  'guide.onboarding.intention.body':
    'Une adresse, une recherche, ou une pensée entière. ÆTHER comprend ce que vous voulez — naviguer, chercher, comparer, confier à Muse — et s’en occupe.',
  'guide.onboarding.intention.anytime': 'à tout moment',

  'guide.onboarding.canvas.title': 'Focus & Toile spatiale',
  'guide.onboarding.canvas.modeFocus': 'Focus',
  'guide.onboarding.canvas.bodyA': 'Le mode',
  'guide.onboarding.canvas.modeCanvas': 'Toile',
  'guide.onboarding.canvas.bodyB': 'montre une ou deux pages, côte à côte. La',
  'guide.onboarding.canvas.bodyC':
    'étale toutes vos pages en cartes que vous déplacez, redimensionnez, rapprochez — comme des pensées sur une table infinie. La constellation, à gauche, en est la carte du ciel.',
  'guide.onboarding.canvas.toggleHint': 'pour basculer',

  'guide.onboarding.muse.title': 'Muse, votre compagnon',
  'guide.onboarding.muse.bodyA':
    'Muse lit la page active et votre constellation pour penser avec vous : résumer, comparer, questionner. Par défaut, tout reste',
  'guide.onboarding.muse.bodyEm': 'local via Ollama',
  'guide.onboarding.muse.bodyB':
    '; vous pouvez aussi brancher Claude, OpenAI ou xAI dans les paramètres. Vos données ne quittent jamais cet appareil sans vous.',
  'guide.onboarding.muse.callHint': 'pour l’appeler',

  'guide.onboarding.skip': 'Passer',
  'guide.onboarding.continueBtn': 'Continuer',
  'guide.onboarding.startBtn': 'Commencer'
}
