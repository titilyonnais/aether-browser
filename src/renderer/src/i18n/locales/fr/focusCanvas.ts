/** Traductions FR — section "focusCanvas". */
export const focusCanvas: Record<string, string> = {
  // FocusView
  'focusCanvas.focusView.voidTitle': 'Par où commencer ?',
  'focusCanvas.focusView.voidSubtitle':
    'ÆTHER n’a pas d’onglets. Exprimez une intention, et elle devient une page, une recherche ou une réponse.',
  'focusCanvas.focusView.expressIntention': 'Exprimer une intention',
  'focusCanvas.focusView.expressIntentionHint': 'Adresse, recherche, ou « compare X et Y »…',
  'focusCanvas.focusView.openHomepage': 'Ouvrir ma page d’accueil',
  'focusCanvas.focusView.discoverCanvas': 'Découvrir la toile',
  'focusCanvas.focusView.guide': 'Guide',

  // PageSlot
  'focusCanvas.pageSlot.untitled': 'Sans titre',
  'focusCanvas.pageSlot.newTabTitle': 'Nouvel onglet',
  'focusCanvas.pageSlot.back': 'Retour (Alt+←)',
  'focusCanvas.pageSlot.forward': 'Avancer (Alt+→)',
  'focusCanvas.pageSlot.stop': 'Arrêter',
  'focusCanvas.pageSlot.reload': 'Recharger (Ctrl+R)',
  'focusCanvas.pageSlot.removeFavorite': 'Retirer des favoris',
  'focusCanvas.pageSlot.addFavorite': 'Ajouter aux favoris',
  'focusCanvas.pageSlot.splitView': 'Scinder la vue',
  'focusCanvas.pageSlot.toggleOrientation': 'Basculer l’orientation',
  'focusCanvas.pageSlot.dismissToCanvas': 'Ranger sur la toile',
  'focusCanvas.pageSlot.closePage': 'Fermer la page (Ctrl+W)',
  'focusCanvas.pageSlot.chromeSchemeSuffix': 'n’existe pas dans ce moteur.',
  'focusCanvas.pageSlot.chromeSchemeExplainerPart1':
    'ÆTHER tourne sur Chromium, pas sur Google Chrome : les pages comme',
  'focusCanvas.pageSlot.chromeSchemeExplainerPart2': 'ou',
  'focusCanvas.pageSlot.chromeSchemeExplainerPart3':
    'appartiennent au produit Google. Les diagnostics du moteur, eux, sont disponibles.',
  'focusCanvas.pageSlot.chromeSchemeAction': 'Voir les pages internes disponibles',
  'focusCanvas.pageSlot.loadErrorTitle': 'Cette page n’a pas pu se charger.',
  'focusCanvas.pageSlot.retry': 'Réessayer',

  // PageStrip
  'focusCanvas.pageStrip.newTab': 'Nouvelle page — exprimer une intention (Ctrl+K)',

  // NewTabPage
  'focusCanvas.newTab.searchPlaceholder': 'Rechercher ou saisir une adresse…',
  'focusCanvas.newTab.customize': 'Personnaliser',
  'focusCanvas.newTab.addShortcut': 'Ajouter',
  'focusCanvas.newTab.editShortcut': 'Modifier',
  'focusCanvas.newTab.removeShortcut': 'Retirer',
  'focusCanvas.newTab.removeRecent': "Retirer de l'historique",
  'focusCanvas.newTab.shortcutTitlePlaceholder': 'Nom (optionnel)',
  'focusCanvas.newTab.shortcutUrlPlaceholder': 'https://exemple.com',
  'focusCanvas.newTab.cancel': 'Annuler',
  'focusCanvas.newTab.save': 'Ajouter',
  'focusCanvas.newTab.widgetsTitle': 'Widgets',
  'focusCanvas.newTab.widget.clock': 'Horloge',
  'focusCanvas.newTab.widget.weather': 'Météo',
  'focusCanvas.newTab.widget.news': 'Actualités',
  'focusCanvas.newTab.weatherTemp': '{{temp}}°C',
  'focusCanvas.newTab.weatherUnavailable': 'Météo indisponible',
  'focusCanvas.newTab.weatherModeAuto': 'Auto',
  'focusCanvas.newTab.weatherModeCity': 'Ville',
  'focusCanvas.newTab.weatherCurrentCity': 'Ville sélectionnée : {{city}}',
  'focusCanvas.newTab.weatherCityPlaceholder': 'Ex. Lyon',
  'focusCanvas.newTab.weatherCustomizeLocation': 'Changer de localisation',
  'focusCanvas.newTab.weatherFeelsLike': 'Ressenti {{temp}}°C',
  'focusCanvas.newTab.weatherHumidity': 'Humidité {{value}} %',
  'focusCanvas.newTab.weatherWind': 'Vent {{value}} km/h',
  'focusCanvas.newTab.weatherUv': 'UV {{value}}',
  'focusCanvas.newTab.weatherSunrise': 'Lever {{time}}',
  'focusCanvas.newTab.weatherSunset': 'Coucher {{time}}',
  'focusCanvas.newTab.newsTitle': 'Actualités',
  'focusCanvas.newTab.newsRefresh': 'Actualiser',
  'focusCanvas.newTab.newsStyle.text': 'Texte',
  'focusCanvas.newTab.newsStyle.photos': '3 gros titres',
  'focusCanvas.newTab.gridSizeTitle': 'Emplacements de la grille',

  // FindBar
  'focusCanvas.findBar.placeholder': 'Rechercher dans la page…',
  'focusCanvas.findBar.previous': 'Précédent (Maj+Entrée)',
  'focusCanvas.findBar.next': 'Suivant (Entrée)',
  'focusCanvas.findBar.close': 'Fermer (Échap)',

  // SiteInfoCard
  'focusCanvas.siteInfo.permissionMedia': 'Caméra & micro',
  'focusCanvas.siteInfo.permissionGeolocation': 'Localisation',
  'focusCanvas.siteInfo.permissionNotifications': 'Notifications',
  'focusCanvas.siteInfo.stateAsk': 'Réglage global',
  'focusCanvas.siteInfo.stateAllow': 'Autoriser',
  'focusCanvas.siteInfo.stateBlock': 'Bloquer',
  'focusCanvas.siteInfo.notHttp':
    'Cette page n’est pas servie via http(s) — aucune information de site.',
  'focusCanvas.siteInfo.securedConnection': 'Connexion sécurisée',
  'focusCanvas.siteInfo.unsecuredConnection': 'Connexion non sécurisée',
  'focusCanvas.siteInfo.showCert': 'Voir le certificat',
  'focusCanvas.siteInfo.permissionsHeading': 'Autorisations pour ce site',

  // PermissionPromptRoot — invite Autoriser/Bloquer (caméra/micro, localisation, notifications)
  'focusCanvas.permissionPrompt.wantsMedia': 'veut utiliser votre caméra et/ou votre micro',
  'focusCanvas.permissionPrompt.wantsGeolocation': 'veut connaître votre position',
  'focusCanvas.permissionPrompt.wantsNotifications': 'veut vous envoyer des notifications',
  'focusCanvas.permissionPrompt.block': 'Bloquer',
  'focusCanvas.permissionPrompt.allow': 'Autoriser',

  // TranslatePopoverCard
  'focusCanvas.translate.unknownLanguage': 'inconnue',
  'focusCanvas.translate.alwaysTranslate': 'Toujours traduire les pages rédigées en {{language}}',
  'focusCanvas.translate.menuPickTarget': 'Choisir une autre langue',
  'focusCanvas.translate.menuFixSource': 'La langue détectée est incorrecte',
  'focusCanvas.translate.menuNeverTranslateSite': 'Ne jamais traduire ce site',
  'focusCanvas.translate.menuBack': 'Retour',

  // TabPreviewCard
  'focusCanvas.tabPreview.untitled': 'Sans titre',
  'focusCanvas.tabPreview.memoryMB': '{{size}} Mo',
  'focusCanvas.tabPreview.memoryKB': '{{size}} Ko',
  'focusCanvas.tabPreview.measuring': 'Mémoire…',
  'focusCanvas.tabPreview.sleeping': 'En veille — aucune vue active',
  'focusCanvas.tabPreview.memory': '{{size}} de mémoire',

  // SpatialCanvas
  'focusCanvas.spatialCanvas.emptyTitle': 'Une toile vide, prête à recevoir vos pensées.',
  'focusCanvas.spatialCanvas.emptyHint':
    'Double-cliquez n’importe où pour poser une carte — ou :',
  'focusCanvas.spatialCanvas.expressIntention': 'Exprimer une intention',
  'focusCanvas.spatialCanvas.zoomOut': 'Zoom arrière',
  'focusCanvas.spatialCanvas.zoomIn': 'Zoom avant',
  'focusCanvas.spatialCanvas.fitAll': 'Tout cadrer',

  // PageCard
  'focusCanvas.pageCard.untitled': 'Sans titre',
  'focusCanvas.pageCard.liveIndicator': 'Page chargée en mémoire',
  'focusCanvas.pageCard.openFocus': 'Ouvrir en mode Focus',
  'focusCanvas.pageCard.closePage': 'Fermer la page',
  'focusCanvas.pageCard.resize': 'Redimensionner',

  // PageListBubble
  'focusCanvas.pageListBubble.countOne': '{{count}} page',
  'focusCanvas.pageListBubble.countOther': '{{count}} pages',
  'focusCanvas.pageListBubble.filterPlaceholder': 'Filtrer…',
  'focusCanvas.pageListBubble.noMatch': 'Aucune page ne correspond.',

  // MusePanel
  'focusCanvas.musePanel.dialogueTab': 'Dialogue',
  'focusCanvas.musePanel.notesTab': 'Notes ({{count}})',
  'focusCanvas.musePanel.providerOffline': 'hors ligne',
  'focusCanvas.musePanel.providerLocal': 'local · {{model}}',
  'focusCanvas.musePanel.contextIncluded': 'Contexte inclus — cliquer pour exclure',
  'focusCanvas.musePanel.contextExcluded': 'Contexte exclu — cliquer pour inclure',
  'focusCanvas.musePanel.activePage': 'Page active',
  'focusCanvas.musePanel.selection': 'Sélection',
  'focusCanvas.musePanel.thinking': 'Muse réfléchit…',
  'focusCanvas.musePanel.copy': 'Copier',
  'focusCanvas.musePanel.pinNote': 'Épingler en note',
  'focusCanvas.musePanel.emptyThreadTitle': 'Que voulez-vous comprendre ?',
  'focusCanvas.musePanel.suggestSummarizeLabel': 'Résumer cette page',
  'focusCanvas.musePanel.suggestSummarizePrompt': 'Résume cette page en points essentiels.',
  'focusCanvas.musePanel.suggestKeyPointsLabel': 'Points clés',
  'focusCanvas.musePanel.suggestKeyPointsPrompt':
    'Quels sont les points clés et les angles morts de cette page ?',
  'focusCanvas.musePanel.suggestExploreLabel': 'Explorer un sujet',
  'focusCanvas.musePanel.suggestExplorePrompt':
    'Aide-moi à explorer un sujet : propose une démarche et les bonnes questions.',
  'focusCanvas.musePanel.offlineTitle': 'Muse attend un esprit.',
  'focusCanvas.musePanel.offlineIntro': 'Lancez',
  'focusCanvas.musePanel.offlineOutro':
    'pour une intelligence entièrement locale — ÆTHER la détecte seul. Ou ajoutez une clé API (Claude, OpenAI, xAI) dans les paramètres.',
  'focusCanvas.musePanel.detect': 'Détecter',
  'focusCanvas.musePanel.configure': 'Configurer',
  'focusCanvas.musePanel.notesEmptyLine1': 'Aucune note épinglée.',
  'focusCanvas.musePanel.notesEmptyLine2': 'Survolez une réponse de Muse et épinglez-la.',
  'focusCanvas.musePanel.deleteNote': 'Supprimer',
  'focusCanvas.musePanel.editNote': 'Modifier',
  'focusCanvas.musePanel.inputPlaceholderDisabled': 'Aucune intelligence disponible',
  'focusCanvas.musePanel.inputPlaceholder': 'Demandez à Muse…',
  'focusCanvas.musePanel.send': 'Envoyer (⏎)',
  'focusCanvas.musePanel.stop': 'Arrêter (Échap)'
}
