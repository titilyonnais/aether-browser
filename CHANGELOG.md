# Journal des modifications — ÆTHER

Toutes les évolutions notables du projet. Le versionnage suit [SemVer](https://semver.org/lang/fr/) :
`MAJEUR.MINEUR.CORRECTIF`. Tant qu'ÆTHER est en `0.x`, chaque lot de fonctionnalités
incrémente le **mineur**, chaque correctif isolé le **correctif**.

## [0.44.3] — 2026-07-16

### Corrigé

- **Course possible dans la Toile spatiale** : une animation de recadrage encore en vol (« Tout cadrer », centrage sur une carte…) au moment de basculer vers un AUTRE espace pouvait persister la position de caméra de l'ANCIEN espace sur le NOUVEAU une fois l'animation terminée. L'animation est désormais annulée dès qu'un nouveau recadrage démarre, qu'un changement d'espace survient, ou au démontage du composant.

## [0.44.2] — 2026-07-16

### Sécurité

- **Durcissement (défense en profondeur) du nom de fichier des téléchargements** — `getFilename()` (dérivé in fine de l'en-tête `Content-Disposition` envoyé par le site distant) est désormais toujours réduit à son nom de base (`basename`) avant d'être combiné au dossier de destination, plutôt que de dépendre uniquement de la sanitation déjà faite par Chromium en amont.

## [0.44.1] — 2026-07-16

### Sécurité

- **N'importe quel site web pouvait usurper notre popup native de confirmation d'installation d'extension.** `document.title` (modifiable par une seule ligne de JS, sur n'importe quelle page) déclenchait le canal utilisé pour cette confirmation, sans vérifier que la page se trouvait bien sur le vrai Chrome Web Store — un site malveillant pouvait donc afficher notre propre bulle « Installer ? » avec un nom et une icône de son choix, pour un identifiant d'extension réel de son choix, trompant l'utilisateur sur ce qu'il installe réellement. Restreint à la même vérification que l'injection du shim du Store elle-même. Un identifiant d'extension mal formé est aussi désormais rejeté explicitement avant toute utilisation dans un chemin de fichier (défense en profondeur).

### Corrigé

- **Le bouton « Signaler un problème » (menu principal) n'ouvrait jamais le client mail.** Le canal `openExternal` n'autorisait que les liens web et les pages de réglages Windows — un lien `mailto:` était filtré silencieusement, sans erreur visible.

## [0.44.0] — 2026-07-16

### Corrigé

- **La bulle « translucide puis pop » persistait malgré le fix DWM de la 0.43.0 — mécanisme d'affichage entièrement réécrit.** Vraie cause, cette fois confirmée par une seconde analyse image par image : une fenêtre popup encore masquée peut ne composer AUCUN frame tant qu'elle n'est pas montrée (rien à afficher), donc aucun délai côté JS — aussi long soit-il — ne pouvait garantir que le contenu était réellement peint avant `showInactive()`. Toutes les bulles (menu principal, menus contextuels, infos de site, aperçus d'onglet, liste d'extensions, vraie bulle d'extension…) utilisent désormais un fondu natif partagé (opacité pilotée depuis le processus principal, immunisé contre le throttling de `requestAnimationFrame` sur les fenêtres masquées) : la fenêtre apparaît à opacité 0 — ce qui force la composition réelle du contenu — puis devient visible en ~90ms, masquant ainsi les tout premiers instants de rendu. La fermeture suit exactement le même fondu, en sens inverse — même délai et même animation pour l'arrivée et la fermeture, sur toutes les bulles de l'appli.

## [0.43.0] — 2026-07-16

### Corrigé

- **La « saccade » des bulles natives persistait malgré le fix de la 0.42.2 — vraie cause enfin identifiée et neutralisée à la source.** `thickFrame: false` (0.42.2) ciblait le mauvais levier : il ne retire que l'ombre/les animations liées au redimensionnement par bordure (`WS_THICKFRAME`), jamais la transition de fondu que Windows applique nativement à l'ouverture d'une fenêtre **transparente**, gérée par le DWM hors de portée de toute option Electron. Neutralisée directement via l'API Windows dédiée (`DwmSetWindowAttribute` + `DWMWA_TRANSITIONS_FORCEDISABLED`, appelée en FFI pure JS — pas de compilation native requise). Une seconde animation qui se superposait (le survol `transition-colors` d'une ligne de menu, quand le clic droit atterrit avec le curseur déjà dessus) est aussi neutralisée pendant les ~120ms suivant chaque ouverture.

## [0.42.2] — 2026-07-16

### Corrigé

- **Bulles natives : « saccade » à l'ouverture, cette fois identifiée par analyse image par image d'un enregistrement fourni.** Toutes les tentatives précédentes (v0.13.0, v0.28.0, v0.39.0, v0.40.0, v0.41.0) portaient sur NOTRE code (animation CSS, timing de mesure) — la cause restait ailleurs : Windows applique par défaut une animation native (fondu/désynchronisation DWM) à l'ouverture et au redimensionnement d'une fenêtre transparente sans cadre, hors de portée de React/CSS. `thickFrame: false` (option Electron dédiée à ce cas) retire cette animation système.

## [0.42.1] — 2026-07-16

### Corrigé

- **La bulle d'une extension s'ouvrait à un endroit différent selon la ligne cliquée, et la liste des extensions ne se refermait pas fiablement.** Ancrée désormais toujours au même endroit (sous l'icône puzzle, en haut à droite) ; ouvrir la vraie bulle ferme maintenant bien la liste (un signal manquant laissait l'icône croire qu'elle était encore ouverte).
- **Liste des extensions : retrait de l'interrupteur activer/désactiver** (reste disponible dans Réglages › Extensions) et la liste n'affiche plus que les extensions activées — elle redevient un simple lancement rapide, pas un second panneau de gestion.
- **Crash « Base de données non initialisée » à la fermeture, encore possible malgré le fix de la 0.41.0** : un changement de focus dans les 300 ms précédant la fermeture pouvait envoyer sa sauvegarde après que le main ait déjà fermé la base — l'anti-rebond correspondant est désormais annulé à la fermeture de la fenêtre, et un filet de sécurité ignore ce message d'erreur précis s'il survient quand même ailleurs, au lieu de faire planter tout le processus.

## [0.42.0] — 2026-07-16

### Ajouté

- **Clic sur une extension → sa vraie bulle** (façon Chrome/Edge/Brave) : la liste d'extensions (icône puzzle) ouvre désormais le vrai `popup.html` de l'extension cliquée — son interface propre (options, état, actions), pas juste le nom et l'interrupteur activer/désactiver.

### Corrigé

- **« Ouvrir cette page (toujours neuve) » rouvrait quand même les onglets de la session précédente.** La vue Focus repartait bien à vide, mais la bande de pages restait peuplée des pages de l'espace actif (cartes permanentes par conception) — perçu comme un réglage cassé. Ce réglage ferme désormais réellement les pages de l'espace actif au lancement (comme Chrome), pas seulement leur affichage ; les autres espaces ne sont pas touchés.
- **Page de nouvel onglet : titres d'actualités tronqués.** Coupés à une ligne (mode texte) ou masqués sous un fondu à hauteur plafonnée (mode photos) — les deux affichent désormais le titre en entier, sans troncature, quelle que soit sa longueur.

## [0.41.0] — 2026-07-16

### Corrigé

- **« Base de données non initialisée » au moment de quitter ÆTHER.** La fermeture de la base se faisait sur `before-quit`, un évènement qui se déclenche AVANT que les fenêtres ne se ferment vraiment — les handlers de fermeture de fenêtre (minimiser au lieu de quitter, sauvegarde de l'état de la fenêtre) tentaient ensuite d'accéder à une base déjà fermée. Déplacé sur `will-quit`, qui se déclenche APRÈS.
- **Bulles natives (menus, infos de site…) qui mettaient ~0,7 s à apparaître.** Le double `requestAnimationFrame` ajouté en 0.39.0 pour éliminer un scintillement se révèle throttlé par Chromium tant que la fenêtre popup reste masquée — le vrai signal n'arrivait jamais à temps et c'est le filet de sécurité (500 ms) qui finissait par afficher la bulle. Mesure redevenue synchrone : apparition immédiate.
- **« Ne pas conserver les onglets à la fermeture » n'empêchait pas l'ouverture d'un autre nouvel onglet.** Les deux réglages indépendants (« ouvrir au démarrage » / « restaurer la dernière session ») pouvaient se cumuler de façon confuse. Fusionnés en un choix unique et exclusif dans Réglages › Navigation.
- **Réglages : barre de recherche peu pratique et texte tronqué.** Rendue toujours visible (plus besoin de cliquer une icône d'abord, comme Chrome/Edge) et son texte d'indication raccourci pour tenir dans la colonne. Elle retrouve aussi désormais les réglages précis (ex. « proxy », « minimiser », « correcteur ») et pas seulement le nom de la section qui les contient.

## [0.40.0] — 2026-07-16

### Ajouté

- **Réglages › À propos : « Vérifier et télécharger automatiquement »** — vérification/téléchargement silencieux au lancement, désormais désactivables (la vérification manuelle continue de fonctionner dans tous les cas).
- **Bulle non intrusive « mise à jour prête »** — une icône apparaît dans la barre de titre dès qu'une mise à jour a fini de se télécharger, et s'ouvre une seule fois automatiquement pour signaler qu'elle est prête (« Redémarrer » ou « Plus tard ») ; ensuite, simple icône cliquable à la demande.
- **La fenêtre se rouvre dans le même état qu'à la fermeture** — plein écran, agrandie ou taille/position normales, restaurées au lancement suivant.

### Corrigé

- **Menu principal coupé à droite et en bas.** Cause trouvée : l'animation d'arrivée des bulles (ajoutée en 0.39.0) utilisait une transformation `scale()` — mesurer la taille réelle du contenu PENDANT cette animation capturait une taille rétrécie, sous-dimensionnant la fenêtre popup. Animation retirée entièrement (apparition et fermeture instantanées, sans fondu).
- **« Restaurer les onglets de la dernière session » rouvrait quand même un nouvel onglet en plus de la page restaurée.** Le nouvel onglet ne s'ouvre plus désormais que si la restauration ne trouve RIEN à afficher pour l'espace actif (tous les onglets fermés avant de quitter, ou premier lancement) — jamais en plus d'une restauration réussie.

## [0.39.0] — 2026-07-16

### Ajouté

- **Réglages › Navigation : « Restaurer les onglets de la dernière session »** — rouvre la page qui était au premier plan dans chaque espace à la fermeture précédente (prioritaire sur « Ouvrir au démarrage »). L'état Focus (page(s) affichée(s), vue scindée) est désormais mémorisé par espace en continu, pas juste au moment de fermer.
- **Réglages › Apparence : visibilité de Constellation et Muse au démarrage** — deux interrupteurs indépendants ; Ctrl+B/Ctrl+J continuent de les basculer normalement pendant la session.
- **Réglages › Système : « Minimiser au lieu de quitter »** — le bouton fermer de la fenêtre minimise dans la barre des tâches au lieu de fermer ÆTHER ; « Quitter ÆTHER » (menu) continue de vraiment quitter.

### Corrigé

- **Scintillement à l'arrivée des bulles natives** (infos de site, aperçus d'onglet, menus…) : la fenêtre popup pouvait devenir visible une fraction de frame avant que son tout premier contenu ne soit réellement peint (fenêtre transparente séparée de la fenêtre principale). Un double `requestAnimationFrame` avant de signaler « prêt à afficher » élimine ce décalage ; un léger fondu+zoom d'arrivée habille aussi mieux la vraie animation.

## [0.38.4] — 2026-07-16

### Corrigé

- **`latest.yml` manquant de la release malgré une CI « réussie » (0.38.3)** : `electron-builder` uploade plusieurs fichiers en parallèle (installeur + blockmap) — quand la release n'existe pas encore, chaque upload tentait de la créer de son côté, une requête gagnant la course pendant que l'autre échouait silencieusement (son fichier n'était jamais envoyé). Le workflow CI crée maintenant la release à l'avance, avant qu'`electron-builder` ne tente le moindre upload — plus de course, plus de fichier manquant.

## [0.38.3] — 2026-07-16

### Corrigé

- **La publication automatique (0.38.2) échouait en réalité** : GitHub refuse de créer directement une release PUBLIÉE pour un tag qui n'existe pas encore (HTTP 422 « Published releases must have a valid tag ») — hors le tag n'est créé qu'AVEC le brouillon. `electron-builder` recrée donc le brouillon (comme avant 0.38.2), et une étape séparée du workflow CI le publie juste après, une fois le tag réellement créé.

## [0.38.2] — 2026-07-15

### Corrigé

- **« Échec de la vérification — no published versions on github » malgré une publication CI réussie** : `electron-builder` crée ses releases GitHub en BROUILLON par défaut (invisible aux requêtes anonymes, donc invisible à `electron-updater` côté postes installés) — le workflow de publication automatique tournait bien, mais sa release restait invisible. `releaseType: release` force une publication immédiate.

## [0.38.1] — 2026-07-15

### Ajouté

- **Publication automatique des releases** : un workflow GitHub Actions (`.github/workflows/release.yml`) build et publie désormais une release dès que `version` change dans `package.json` sur `main` — plus besoin de lancer `npm run release` à la main ni de gérer un jeton (`GITHUB_TOKEN` fourni gratuitement par GitHub Actions, scope limité à ce dépôt).

### Corrigé

- **Plantage à la fermeture** (`TypeError: Object has been destroyed` dans `ViewManager.destroyView`/`closeAll`) : `closeAll()` s'exécute après que la fenêtre principale soit déjà détruite (évènement `closed`), et retirait quand même une vue de son `contentView` — désormais ignoré si la fenêtre n'existe plus.
- **Installation en double possible entre deux versions** : `allowToChangeInstallationDirectory` permettait de choisir un dossier différent à chaque installation manuelle, empêchant une mise à jour de se poser par-dessus l'existant. L'installeur NSIS utilise maintenant toujours le même emplacement (`oneClick: true`).



### Ajouté

- **Mises à jour automatiques, façon Chrome/Edge.** ÆTHER vérifie silencieusement au lancement, télécharge en arrière-plan dès qu'une nouvelle version est trouvée, et propose de redémarrer pour l'installer une fois prête — visible dans Réglages › À propos, avec aussi un bouton « Rechercher les mises à jour » pour une vérification manuelle. Basé sur `electron-updater` + GitHub Releases (dépôt public [titilyonnais/aether-browser](https://github.com/titilyonnais/aether-browser)) : gratuit, sans serveur à maintenir, et l'app distribuée ne contient aucun jeton — seule la publication d'une version (`npm run release`, poste de développement uniquement) en nécessite un.
- **Dépôt Git initialisé et publié** — première publication du code source, nécessaire pour héberger les futures releases.

## [0.37.2] — 2026-07-15

### Corrigé

- **Interrupteurs on/off toujours incorrects malgré le fix précédent** : abandon de l'approche « rond positionné en absolu + translation calculée à la main » (source d'erreurs difficiles à repérer) au profit d'un simple alignement flexbox (`justify-start`/`justify-end`) — le rond se place structurellement à gauche ou à droite sans aucun calcul de décalage à faire soi-même.
- **Description d'extension affichée telle quelle (`__MSG_extDescription__`)** au lieu du vrai texte : la résolution i18n (déjà en place pour le nom) ne s'appliquait qu'au nom, jamais à la description. Généralisée aux deux.
- **Icônes d'extension toujours absentes pour certaines extensions** malgré le repli `action.default_icon` — vérifié à nouveau, ce repli reste en place ; un redémarrage complet d'ÆTHER peut être nécessaire pour qu'un changement côté processus principal soit pris en compte (contrairement à l'interface, qui se recharge à chaud).
- **« Erreur de téléchargement » affichée par le Store malgré une installation réelle réussie** : le vrai déclencheur trouvé — nos callbacks `beginInstallWithManifest3`/`completeInstall` attendaient la confirmation réelle de l'utilisateur dans la popup ÆTHER avant de répondre à la page, un délai que le Store n'attend probablement pas (sa propre boîte de dialogue native, elle, est bloquante et n'a pas ce problème). Les callbacks répondent désormais immédiatement ; notre popup de confirmation reste la seule chose qui décide si le téléchargement réel a lieu.

## [0.37.1] — 2026-07-15

### Corrigé

- **Le bouton Extensions de la barre de titre restait actif après un clic ailleurs sur l'appli, et demandait deux clics pour se rouvrir.** Il lui manquait l'écouteur clic-extérieur/Échap présent sur les autres boutons de menu (`AppMenuButton`) — corrigé.
- **Icône générique affichée pour la plupart des extensions du Store**, même après le fix précédent sur l'URL locale : beaucoup d'extensions MV3 minimalistes ne déclarent pas d'`icons` racine, seulement l'icône de leur bouton de barre d'outils (`action.default_icon`). Repli ajouté sur `action`/`browser_action`/`page_action`.
- **Interrupteur visuellement cassé persistant** malgré l'alignement des proportions sur le composant déjà éprouvé : ajout d'un `overflow-hidden` sur le rail (dans les deux composants concernés) pour garantir que rien ne puisse jamais dépasser visuellement de la forme arrondie, quelle que soit la cause exacte.

## [0.37.0] — 2026-07-15

### Ajouté

- **« Extensions chargées » refaite en grille de cartes façon `chrome://extensions`** : icône, nom, description, boutons Détails/Supprimer et bascule d'activation par carte. « Détails » ouvre une vraie fiche : description, version, taille sur disque, autorisations (libellés lisibles quand reconnues), source (Chrome Web Store ou dossier local), lien vers la fiche du Store et vers la page d'options de l'extension si elle en déclare une.

### Corrigé

- **Interrupteur d'activation/désactivation visuellement cassé** (le rond dépassait de son rail) dans le nouveau menu Extensions de la barre de titre — mauvaises proportions, corrigées en reprenant celles, déjà éprouvées, du composant de bascule des Réglages.
- **Bug de syntaxe qui empêchait purement et simplement la compilation** : un commentaire de documentation contenant littéralement `*/` au milieu d'un exemple de motif d'URL refermait le commentaire en plein milieu, laissant le code qui suivait invalide. Trouvé par isolation du fichier, corrigé en reformulant le commentaire.
- **Tentative d'amélioration du faux message d'erreur affiché PAR LE STORE LUI-MÊME** (« Erreur de téléchargement ») après une installation qui, elle, réussit réellement : ajustement de la convention d'appel du callback `completeInstall` simulé (succès signalé sans argument plutôt qu'avec une chaîne vide). Best-effort — l'API interne de Google n'étant pas documentée, ce message peut malgré tout persister sans affecter l'installation réelle.

## [0.36.2] — 2026-07-15

### Retiré

- **Bouton flottant de secours « Installer dans ÆTHER »** — devenu inutile, le vrai bouton du Store se débloque de façon fiable.

### Corrigé

- **Icônes d'extension jamais affichées** (ni dans « Extensions chargées » des Réglages, ni dans le nouveau menu de la barre de titre) : l'URL locale du fichier icône était construite à la main (`file://` + chemin Windows à antislashs), invalide sous Windows. Utilise maintenant `pathToFileURL`, plus un repli automatique sur l'icône générique si l'image échoue quand même à charger.
- **Zone cliquable du bouton d'activation/désactivation trop grande** (toute la ligne de l'extension réagissait au clic, pas seulement l'interrupteur) — le composant `Toggle` réutilisé était pensé pour une ligne de réglage entière, pas un interrupteur isolé à côté d'un contenu. Remplacé par un interrupteur compact dédié dans la liste des extensions.
- **Le vrai bouton du Store se regrisait après une actualisation de la page**, rendant toute nouvelle installation impossible sans redémarrer ÆTHER. Le crochet est maintenant ré-attaché et ré-enregistré à chaque navigation qualifiante (au lieu d'une seule fois), qui s'est révélé plus robuste qu'un diagnostic exact de la cause de la perte.
- **Nom d'extension toujours vide dans certains cas** : repli défensif supplémentaire à l'affichage (jamais de nom vide affiché) en complément de la résolution i18n déjà en place.

### Note

- Certaines extensions installées peuvent afficher des erreurs dans la console concernant des API Chrome absentes (ex. `chrome.commands`) ou l'enregistrement de leur service worker — limitation connue d'Electron, dont le support des extensions Chrome reste partiel (pas 100% de l'API réelle de Chrome), indépendante d'ÆTHER.

## [0.36.1] — 2026-07-15

### Ajouté

- **Icône Extensions dans la barre de titre** (façon Chrome, à côté des téléchargements) — n'apparaît que si au moins une extension est chargée ; clic = petite liste avec bascule activer/désactiver et lien vers la gestion complète.

### Corrigé

- **Le bouton du Store restait bloqué sur « Ajouter à Google Chrome » après une installation réussie.** Bug dans l'ordre des opérations du shim `chrome.webstorePrivate` : l'entrée en attente était supprimée avant que la page ait pu enregistrer son callback `completeInstall`, qui n'était donc jamais résolu. Corrigé, et le statut de l'extension (« installable »/« installed ») est maintenant suivi pour que `getExtensionStatus` reflète une installation qui vient de réussir.
- **Nom d'extension toujours vide malgré le fix précédent.** La résolution i18n ne se déclenchait que sur une NOUVELLE installation — une ligne déjà enregistrée (même avec un nom vide) n'était jamais recalculée. Le nom est maintenant recalculé et corrigé en base à chaque rechargement (démarrage, changement de profil, ou nouveau clic sur Installer).
- **Popup de confirmation d'installation repositionnée en haut de la fenêtre** (comme la vraie bulle de Chrome, sous la barre d'adresse) au lieu du centre de l'écran.

### Ajouté

- **Tentative de déblocage du vrai bouton « Ajouter à Chrome » du Web Store.** ÆTHER fournit maintenant ce qui manque à Electron pour que Google considère le navigateur comme éligible : la marque « Google Chrome » dans les Client Hints (`navigator.userAgentData`), et une réimplémentation de l'API interne `chrome.webstorePrivate` que le Store appelle pour piloter l'installation. Reconstitution non documentée (peut cesser de fonctionner si Google change son code) — le bouton flottant ÆTHER reste posé en filet de sécurité si le vrai bouton refuse malgré tout de s'activer.
- **Popup de confirmation avant toute installation**, dans l'esprit de la vraie boîte de dialogue Chrome (icône, nom de l'extension, avertissement, Ajouter/Annuler) — plus jamais d'installation silencieuse au clic, qu'il s'agisse du vrai bouton ou du bouton de secours.

### Corrigé

- **Nom d'extension non détecté après installation depuis le Store.** Beaucoup d'extensions utilisent un nom internationalisé (`"name": "__MSG_extName__"` dans le manifest, résolu via `_locales/<langue>/messages.json`) — non géré jusqu'ici, d'où un nom vide dans « Extensions chargées ». Résolu.

## [0.35.1] — 2026-07-15

### Corrigé

- **Le vrai bouton « Ajouter à Chrome » du Web Store reste grisé par Google pour tout navigateur non reconnu — impossible à cliquer, donc impossible à intercepter.** Remplacé par un bouton flottant propre à ÆTHER (« Installer dans ÆTHER »), affiché sur toute fiche d'extension et qui déclenche réellement l'installation, sans dépendre du tout de la détection de navigateur de Google.

## [0.35.0] — 2026-07-15

### Ajouté

- **Installation réelle d'extensions depuis le vrai Chrome Web Store.** Réglages › Extensions ouvre désormais le Store comme une page normale dans ÆTHER (au lieu du navigateur externe) — cliquer sur le vrai bouton « Installer » télécharge et charge réellement l'extension, sans quitter l'appli. Mécanisme honnête : la page du Store n'est pas trafiquée, seul le clic sur « Installer » est intercepté (Google bloque l'appel direct pour tout navigateur non listé) puis ÆTHER effectue lui-même les deux étapes qu'aurait faites Chrome — téléchargement du `.crx` depuis le point de distribution public de Google, extraction, puis chargement via le même mécanisme que les extensions non empaquetées.

## [0.34.0] — 2026-07-14

### Ajouté

- **Table dédiée aux recherches, séparée de l'historique de navigation.** Le menu « récents » du champ de recherche ne montre désormais QUE les requêtes vraiment tapées dans la barre de recherche ou la barre d'intention — plus jamais les pages simplement visitées (lien cliqué, favori ouvert…), qui n'ont rien à voir.

### Corrigé

- **Panneau « Personnaliser » (page de nouvel onglet) affiché trop haut au-dessus du bouton.** Un padding posé sur le même conteneur que l'ancrage du panneau décalait son point de référence de 40px — corrigé.
- **Le panneau « Personnaliser » ne se refermait pas au clic ailleurs sur l'écran.** Ajout du même comportement que les autres menus de la page.

## [0.33.1] — 2026-07-14

### Corrigé

- **Retirer une recherche récente supprimait aussi la vraie entrée d'historique de navigation.** La croix appelait une suppression directe dans la table des visites, partagée avec l'overlay Historique — désormais totalement dissocié : la croix masque juste cette entrée dans le menu du champ de recherche (un réglage dédié, jamais l'historique réel), qui reste intact et inchangé.

## [0.33.0] — 2026-07-14

### Ajouté

- **Croix pour retirer une recherche récente** individuellement, au survol d'une ligne dans le menu du champ de recherche (page de nouvel onglet).
- **Un espace ne reste plus jamais totalement vide** : fermer son tout dernier onglet fait immédiatement atterrir sur une page de nouvel onglet, au lieu de laisser un espace sans plus aucun moyen d'en ouvrir un (le bouton « + » vit dans la bande de pages, elle-même absente sans la moindre page).

## [0.32.3] — 2026-07-14

### Corrigé

- **Une même recherche apparaissait plusieurs fois dans les « récents ».** Une seule navigation (redirections, `history.pushState`…) peut déclencher plusieurs signaux de fin de chargement coup sur coup pour la MÊME page — sans déduplication, chacun enregistrait sa propre ligne d'historique. `visitsRepo.record()` fusionne désormais toute visite de la même URL survenue dans les 30 dernières secondes (mise à jour de la ligne existante) au lieu d'en créer une nouvelle. Les doublons déjà en base sont nettoyés (migration).
- **8 champs vides affichés quand aucune recherche récente n'existe.** Le champ de recherche filtre maintenant les entrées d'historique cassées (résiduelles, URL/titre vides) et déduplique par URL avant affichage — si plus rien ne reste après ce nettoyage, le menu ne s'affiche plus du tout, comme demandé.

## [0.32.2] — 2026-07-14

### Modifié

- **Retiré le maintien de position à la fermeture d'un onglet (façon Chrome).** Fermer un onglet (clic milieu ou croix) réagence à nouveau la bande immédiatement, que la souris reste dessus ou non — l'ancien comportement, qui gardait la place le temps que la souris quitte la bande, se lisait comme un blocage plutôt que comme un vrai comportement voulu.

### Corrigé

- **Lignes vides dans les « récents » du champ de recherche, persistantes malgré le fix précédent.** Le filtre ne portait que sur `aether:` ; certaines pages (tout schéma confondu) peuvent émettre un `did-stop-loading` fantôme pour leur tout premier commit (`about:blank`, avant même le vrai chargement), avec une URL et un titre vides — désormais filtré aussi (`main/ipc.ts`), et les entrées déjà en base sont purgées (migration élargie).

## [0.32.1] — 2026-07-14

### Corrigé

- **Le champ de recherche de la page de nouvel onglet s'ouvrait tout seul au démarrage** (menu « récents » affiché sans clic) : il avait le focus automatique (`autoFocus`), qui déclenchait le nouvel affichage « récents à l'ouverture » sans intervention de l'utilisateur — retiré.
- **Entrées vides/cassées dans les « récents »** (icône loupe sans texte) : `aether://newtab` était enregistrée comme une vraie visite d'historique depuis que cette page charge réellement un document (v0.27.0, pour que le bouton « retour » fonctionne) — un onglet interne n'est pourtant pas un site visité. Plus aucune nouvelle entrée créée désormais, et les entrées déjà en base sont purgées automatiquement au prochain lancement.

## [0.32.0] — 2026-07-14

### Corrigé

- **Caractères accentués (é, è, û…) affichés en losange point d'interrogation.** L'API de suggestions Google répond en `ISO-8859-1` (vérifié en direct) — décoder sa réponse comme de l'UTF-8 (hypothèse par défaut de `Response.json()`) corrompait tout caractère accentué. Décodage explicite en Latin-1 avant analyse JSON.
- **Animation d'ouverture/fermeture d'onglet toujours figée puis saccadée — vraie cause trouvée (recherche dédiée sur le fonctionnement de Framer Motion).** `AnimatePresence mode="popLayout"` (ajouté cette session) exige que son ANCÊTRE DIRECT ait un `position` autre que `static` — sans ça, l'onglet en cours de sortie se positionne en absolu contre le mauvais ancêtre (la rangée externe, pas la zone défilante), cassant le réagencement immédiat des voisins que `popLayout` est censé permettre. Ajouté `position: relative` sur ce conteneur précis.
- **Texte des actualités « 3 gros titres » toujours coupé en bas.** Le fondu ajouté précédemment était trop étroit (14px, moins qu'une ligne de texte) — la dernière ligne partiellement visible restait à moitié tranchée avant même d'entrer dans la zone de fondu. Élargi à 28px (plus d'une ligne pleine) et remplacé le `<span>` par un `<div>` (un inline ignore `overflow`/`max-height` sans dépendre implicitement de la « blockification » d'un `position:absolute`).

### Ajouté

- **Recherches récentes à l'ouverture du champ de recherche** (page de nouvel onglet) : cliquer la barre avant même de taper propose déjà les derniers sites visités, comme tout navigateur.

### Modifié

- **Suggestions de recherche dès 1 caractère** (au lieu de 2 minimum).

## [0.31.0] — 2026-07-14

### Ajouté

- **Suggestions de recherche façon barre d'adresse Chrome** sur la page de nouvel onglet — proposées au fil de la frappe (API de complétion Google, sans clé), navigables au clavier (↑↓, Entrée).
- **Fermeture d'onglet façon Chrome** : fermer un onglet ne réagence plus la bande tant que la souris reste dessus — l'emplacement est retenu (comme dans Chrome/Edge/Brave), permettant de fermer plusieurs onglets d'affilée au même endroit ; le réagencement n'a lieu qu'en quittant la bande.

### Corrigé

- **Texte des actualités encore coupé en bas.** Le plafond de hauteur empêche déjà tout débordement hors du cadre, mais une coupe nette en fin de texte restait visible sur les titres longs — un fondu (`mask-image`, même principe que `fade-truncate` ailleurs dans l'appli) adoucit désormais cette coupe, quelle que soit la longueur du titre.
- **Bulle de dossier de favoris trop lente à apparaître face au menu 3 points.** Le popup attendait un aller-retour IPC (deux requêtes séparées, favoris + dossiers) avant son tout premier rendu, contrairement au menu 3 points qui n'a rien à charger. La bande de favoris connaît déjà ces données dans son propre store : elles voyagent désormais directement dans la requête d'ouverture du popup, qui les affiche dès son premier rendu — la resynchronisation IPC reste en tâche de fond pour les mises à jour ultérieures.
- **Animation de fermeture/ouverture d'onglet resserrée à 200 ms** avec la courbe de la bande d'onglets de Chromium (`BoundsAnimator`), après recherche sur le comportement réel de Chrome.

## [0.30.0] — 2026-07-14

### Ajouté

- **Réglage « Ouvrir au démarrage de l'application »** (Navigation, activé par défaut) : atterrit sur la page de nouvel onglet à chaque lancement, en plus des pages restaurées de la session précédente.
- **Bouton d'actualisation des actualités** — pioche un nouveau sous-ensemble parmi un lot plus large plutôt que de dépendre du rythme de publication réel du flux entre deux clics.
- **Widget météo enrichi** : ressenti, humidité, vent, indice UV, lever/coucher du soleil, dépliables directement dans la bulle (clic dessus).

### Modifié

- **Cartes d'actualités « 3 gros titres » agrandies** (proportion plus généreuse, texte plus grand) — elles restaient trop fines malgré le passage en 16:9 de la version précédente.
- **Fermeture/ouverture d'un onglet : transition resserrée en un seul bloc rigide.** Un ressort donnait à chaque onglet un rebond légèrement décalé des autres, perçu comme des éléments indépendants plutôt qu'un bloc — remplacé par une même durée fixe (tween) partout, onglets et bouton « + » inclus, pour que tout arrive à destination au même instant.

### Corrigé

- **Widget météo : rouvrir le sélecteur de ville affichait le texte de la recherche précédente sans ses résultats.** `cityDraft` reprenait la même valeur qu'à la dernière ouverture — un `useState` avec une valeur INCHANGÉE ne redéclenche pas l'effet de recherche débouncée qui en dépend. Les suggestions correspondantes sont maintenant redemandées explicitement, sans délai, dès l'ouverture.

## [0.29.0] — 2026-07-14

### Ajouté

- **Météo transformée en vraie bulle en haut à gauche de la page** : icône, température, ville/région/pays. Cliquer dessus ouvre son propre panneau de personnalisation (auto ou ville précise), plutôt que de passer par le menu général « Personnaliser ». La ville exacte sélectionnée (avec région et pays, pour lever toute ambiguïté entre homonymes) y est désormais affichée noir sur blanc.

### Modifié

- **Bloc « + » de la bande de pages rejoint le groupe animé des onglets** : à la fermeture d'un onglet entre deux autres, tout le bloc à droite (onglets restants + bouton +) glisse désormais ensemble d'un seul mouvement, au lieu que le bouton saute instantanément pendant que les onglets glissaient en douceur.

### Corrigé

- **Texte des actualités « 3 gros titres » débordant du cadre, rogné à la serpe sans points de suspension.** `-webkit-line-clamp` s'est révélé peu fiable dans ce contexte (superposition sur image + position absolue) — remplacé par un plafond de hauteur explicite, un recadrage déterministe qui ne dépend plus de ce mécanisme.
- **Sélection d'une ville pour la météo : ambiguïté entre homonymes.** La ville choisie n'était stockée que par son nom, re-géocodé à chaque appel — deux villes homonymes (ex. plusieurs « Paris ») pouvaient résoudre vers la mauvaise. Les coordonnées exactes de la ville choisie sont désormais mémorisées directement au moment de la sélection, aucune ambiguïté possible.

## [0.28.0] — 2026-07-14

### Modifié

- **Actualités « 3 gros titres » remises côte à côte** (3 colonnes en 16:9), après une première tentative en bannières empilées qui ne correspondait pas à la demande.
- **Icône des raccourcis agrandie pour remplir tout le carré**, au lieu d'une petite icône centrée avec du vide autour (+ résolution de la source doublée pour rester nette).
- **Logo ÆTHER retiré de la page de nouvel onglet.**

### Corrigé

- **Animation de fermeture d'onglet encore saccadée** : la sortie animait `width`/`margin` (des propriétés qui forcent un recalcul de mise en page à chaque frame) en plus du repositionnement des voisins — remplacé par un simple fondu + réduction (`opacity`/`scale`, uniquement des propriétés `transform`, gérées par le compositeur graphique sans reflow).
- **Scintillement « ouverture double » de toutes les bulles (infos de site, aperçu d'onglet, menus…) — vraie cause trouvée.** L'anti-rebond ajouté précédemment ne protégeait que le tout premier affichage d'une bulle ; il ne s'appliquait PAS quand la bulle était déjà visible et que son contenu changeait (survol d'un onglet à un autre, navigation dans un sous-menu…) — ce redimensionnement-là appliquait les nouvelles bornes immédiatement, sans filet, d'où le sursaut. Un seul anti-rebond (60 ms) s'applique désormais systématiquement, plus de première fois.
- **Autocomplétion de ville météo : la liste ne se refermait pas et sélectionner une autre ville ne changeait rien.** Deux bugs distincts : (1) sélectionner une suggestion changeait `cityDraft`, ce qui relançait malgré tout une recherche pour ce même texte 250 ms plus tard et rouvrait la liste toute seule ; (2) cliquer une suggestion faisait perdre le focus du champ, déclenchant son `onBlur` juste après avec l'ANCIENNE valeur (fermée sur le rendu précédent), qui écrasait la ville qu'on venait de choisir.

## [0.27.0] — 2026-07-14

### Ajouté

- **Météo : autocomplétion de ville** (suggestions débouncées, géocodage sans clé) au lieu d'une simple saisie libre.

### Modifié

- **Widget actualités en mode « 3 gros titres » repensé en bannières 16:9 empilées** (au lieu d'une grille de 3 vignettes verticales étroites), plus lisible.

### Corrigé

- **Impossible de revenir à la page de nouvel onglet après une recherche ou un clic sur une actu** : le correctif de la 0.26.0 (charger réellement `aether://newtab` pour créer une entrée d'historique) était incomplet — une fois REVENU sur cette URL, la vraie vue web (déjà attachée et visible depuis la navigation précédente) restait affichée par-dessus le composant React, puisque rien ne la masquait explicitement quand `PageSlot` cessait de suivre ses bornes. Corrigé en réduisant la vue à 0×0 dès que le suivi des bornes s'arrête (`useViewBounds`), ce qui la rend invisible sans la détacher.
- **Animation de fermeture d'onglet : un scintillement de scrollbar apparaissait ~0,5 s.** Le survol utilisait `layout` (position ET taille) sur les onglets, ce qui pouvait faire déborder transitoirement la rangée pendant le ressort ; passé en `layout="position"` (plus de mise à l'échelle) et la barre de défilement de cette rangée est désormais masquée visuellement (`scrollbar-none`, molette/glisser toujours actifs).
- **Titre « Nouvel onglet » toujours rogné** : le fondu de troncature (`fade-truncate`) s'applique à même une boîte exactement ajustée au texte — il masquait donc systématiquement sa toute fin, indépendamment de toute troncature réelle. Retiré pour ce libellé fixe, qui n'a jamais besoin d'être tronqué.

## [0.26.0] — 2026-07-13

### Ajouté

- **Météo : choix entre géolocalisation automatique et ville fixe**, saisie depuis « Personnaliser » (géocodage sans clé via open-meteo).
- **Raccourcis de la page de nouvel onglet : icône réelle du site** détectée automatiquement (service public de favicons, sans avoir à charger la page), au lieu du simple avatar-lettre.
- **Grille de raccourcis par tranches de 5** (5/10/15/20) plutôt que 4/8/12/16.

### Modifié

- **Widget actualités en mode « 3 gros titres » agrandi** : cartes plus grandes, texte plus lisible, largeur du bloc élargie.
- **Animation de fermeture d'onglet retravaillée** : l'onglet fermé s'estompe et se réduit proprement (`AnimatePresence`) au lieu de disparaître instantanément pendant que ses voisins glissent.
- **Titre « Nouvel onglet » de l'en-tête** n'est plus rogné — le plafond de largeur (pensé pour laisser de la place au bouton d'adresse) ne s'applique plus quand ce bouton est absent.

### Corrigé

- **Impossible de revenir à la page de nouvel onglet avec « retour »** après une recherche depuis cette page : `aether://newtab` n'était jamais réellement chargé dans la vue (uniquement masqué derrière le composant React), donc Chromium n'inscrivait aucune entrée d'historique de navigation à son sujet. Le protocole `aether://` sert désormais un document minimal pour cet hôte — la page est réellement chargée (mais toujours masquée derrière le widget), ce qui restaure un vrai « retour ».

## [0.25.0] — 2026-07-13

### Ajouté

- **Nombre d'emplacements de la grille de raccourcis réglable** (4/8/12/16) depuis « Personnaliser » sur la page de nouvel onglet.
- **Widget actualités : choix d'affichage** — texte seul (plus d'articles) ou 3 gros titres illustrés (flux basculé vers Le Monde, qui fournit des images fiables, contrairement à Google Actualités).

### Corrigé

- **Un raccourci cliqué sur la page de nouvel onglet restait invisible tant qu'on ne changeait pas d'onglet et qu'on ne revenait pas.** `ViewManager.setBounds()` positionnait bien la vue native mais ne l'attachait jamais au `contentView` de la fenêtre si elle ne l'était pas encore déjà — cas exact d'une page de nouvel onglet qui vient de naviguer vers une vraie URL pour la première fois (ses bornes n'avaient jamais été posées auparavant, `viewEnabled` étant resté faux jusque-là). Il fallait un second passage par `setVisible()` (déclenché par un changement d'onglet) pour que l'attache ait enfin lieu. Corrigé en repassant systématiquement par `applyLayout()`, qui gère bornes ET attache ensemble.
- **Météo : rien ne s'affichait.** `ipapi.co` (géolocalisation par IP) rate-limite les requêtes anonymes de façon très agressive et renvoyait systématiquement une erreur — remplacé par `ip-api.com`, plus permissif en pratique.

## [0.24.0] — 2026-07-13

### Ajouté

- **Page de nouvel onglet — vraie recherche, raccourcis éditables et widgets.** Le champ de recherche se tape directement (URL/recherche/intention classées à la volée), sans plus passer par la grande barre d'intention. Les raccourcis de sites sont désormais une grille éditable de 8 emplacements : ajout, modification et suppression de chaque tuile, avec des emplacements vides cliquables pour en ajouter. Trois widgets activables depuis « Personnaliser » : horloge, météo (géolocalisation approximative par IP, sans clé ni compte) et actualités (titres cliquables qui remplacent l'onglet).

### Modifié

- **Bouton « + » de la bande de pages désormais collé au dernier onglet** au lieu de rester plaqué au bord droit de la fenêtre quand peu d'onglets sont ouverts.

## [0.23.0] — 2026-07-13

### Ajouté

- **Page de nouvel onglet.** Le bouton « + » de la bande de pages ouvre désormais une vraie page (façon Brave/Chrome) au lieu de la barre d'intention : raccourcis vers les favoris de l'espace courant, et un grand champ qui ouvre la barre d'intention (Ctrl+K) pour rechercher ou naviguer.
- **URL personnalisée pour le nouvel onglet** (Réglages › Navigation) : possibilité de remplacer la page intégrée par une URL au choix, sur le même modèle que la page d'accueil.

## [0.22.2] — 2026-07-13

### Modifié

- **Barres de recherche : la rangée dépliée prend maintenant toute la largeur du panneau** (le placeholder « Rechercher dans l'historique… » était rogné dans le petit champ précédent) — l'icône reste compacte dans l'en-tête, mais le clic déplie désormais une vraie rangée pleine largeur juste en dessous, plutôt qu'un champ qui s'élargissait sur place.
- **Sélecteur de dossier (vue Favoris complète) remplacé** : l'ancien `<select>` natif ouvrait un menu déroulant entièrement dessiné par l'OS (rectangle blanc plat, hors charte). Nouveau menu déroulant maison, cohérent avec le reste de l'interface.

### Corrigé

- **Menu principal (3 points) resté bloqué dans un sous-menu après fermeture/réouverture.** La fenêtre popup n'est que masquée entre deux ouvertures (jamais détruite), donc son arbre React — et l'état local du sous-menu affiché — survivait d'une ouverture à l'autre. Corrigé en forçant un vrai remontage à chaque nouvelle ouverture (même correctif appliqué aux menus contextuels génériques, qui avaient le même risque).

## [0.22.1] — 2026-07-13

### Modifié

- **Barres de recherche (Historique/Favoris/Téléchargements/Paramètres) : icône loupe qui se déplie au clic**, plutôt qu'un champ toujours affiché — animation ressort, nouveau composant partagé `SearchField`.
- **Liseré gris au clic dans un champ de texte, remplacé par une lueur colorée plus soignée** (bordure + ombre douce teintée), y compris le champ de Muse.

### Corrigé

- **Vraie source du liseré trouvée** : une règle globale (`global.css`) posait un contour sur tout élément « focus-visible » — Chromium considère un champ de texte comme focus-visible au moindre clic SOURIS (contrairement aux boutons, qui ne le sont qu'au clavier), d'où ce contour systématique en cliquant dans n'importe quel champ malgré `outline-none` posé localement. Exclu désormais les champs de texte de cette règle générique, au profit du traitement au focus propre à chaque champ.

## [0.22.0] — 2026-07-13

### Ajouté

- **Barre de recherche + filtres dans Historique, Favoris, Téléchargements et Paramètres.** Historique : recherche texte (titre/adresse) + filtre par période (Aujourd'hui/Hier/7 jours/Tout). Favoris : recherche texte + filtre par dossier. Téléchargements : recherche par nom de fichier + filtre par type (Images/Vidéos/Audio/Documents/Archives). Paramètres : champ de recherche au-dessus de la liste des sections, avec quelques synonymes par section (ex. « sombre »/« clair » trouvent Apparence) pour aider à localiser un réglage sans connaître le nom exact de sa section.

### Corrigé

- **Sursaut persistant à l'apparition d'une bulle, toujours pas réglé par le délai précédent.** Vraie cause trouvée : un contenu qui charge ses données de façon asynchrone (favoris d'un dossier, infos de site…) mesure d'abord un état de chargement, PUIS se redessine plus grand une fois les vraies données arrivées — si ce second redimensionnement survient APRÈS que la fenêtre soit déjà montrée (ce qui arrivait dès que le premier signal suffisait à la révéler), elle « saute » visiblement sous les yeux de l'utilisateur. Corrigé en attendant que les redimensionnements se stabilisent (anti-rebond de 60ms) avant de révéler la fenêtre, au lieu de révéler dès le tout premier signal.

## [0.21.2] — 2026-07-13

### Corrigé

- **Bulle d'aperçu d'onglet trop rapide au survol** : délai doublé (700ms → 1400ms) avant apparition.
- **Scintillement occasionnel à l'apparition d'une bulle** : le filet de sécurité qui force l'affichage si le contenu ne remonte pas sa taille à temps (200ms) pouvait, sur un premier affichage, arriver AVANT le vrai signal de mesure — la fenêtre apparaissait alors à sa taille par défaut avant de sauter à sa vraie taille l'instant d'après. Délai porté à 500ms, largement suffisant pour laisser le vrai signal gagner la course dans l'immense majorité des cas.
- **Bulle du clic droit sur une page web (Inspecter…) ne se fermait pas en cliquant ailleurs SUR LA MÊME page** : `wc.on('focus')`, le seul signal utilisé pour détecter un clic dans une page, ne se redéclenche pas si la page avait déjà le focus (le cas typique après un clic droit dessus) — Electron n'expose aucun évènement générique de clic sur une page côté main. Corrigé en injectant un détecteur ponctuel directement dans la page (`executeJavaScript`, retourne une promesse qui se résout au premier clic) pour fermer la bulle à ce moment-là.

## [0.21.1] — 2026-07-13

### Corrigé

- **Les nouvelles bulles de menu contextuel (favoris, page web…) ne se fermaient pas au clic ailleurs dans la chrome.** Contrairement au menu principal ou à la bulle de dossier de favoris (qui ont chacun leur propre état d'ouverture et leur propre détecteur de clic extérieur), les menus contextuels génériques sont ouverts en tire-et-oublie, sans rien qui écoute un clic ailleurs. Ajout d'un détecteur global (clic ou Échap n'importe où dans la fenêtre principale ferme le popup flottant actuellement affiché) — sans risque pour les popovers qui gèrent déjà leur propre fermeture.

## [0.21.0] — 2026-07-13

### Modifié

- **Tous les menus contextuels (clic droit) convertis en bulles flottantes, cohérentes avec le menu principal** : favoris, dossiers de favoris, onglets, espaces, et le clic droit sur une page web (Retour/Avancer/Copier/Couper/Coller/Ouvrir un lien/Inspecter…). Nouveau système générique (`ContextMenuRow`/`ContextMenuPopoverCard.tsx`/`showContextMenuPopover`) : chaque menu contextuel envoie des données (libellés, coché/désactivé, sous-menus) plutôt qu'un `Menu.buildFromTemplate` natif, affichées dans une bulle DOM qui mesure sa vraie taille et s'ancre au point du clic droit. Sous-menus (« Déplacer vers » d'un favori, « Couleur » d'un espace) navigables par panneau avec bouton retour. Exception assumée : le clic droit sur un favori DEPUIS la bulle d'un dossier reste un menu natif classique (positionné au curseur) — ses coordonnées appartiennent à une autre fenêtre que la principale, où l'ancrage précis n'a pas de sens ; ce cas n'a jamais posé de problème de positionnement. Le menu de bascule de profil et le menu de débordement de la barre de favoris (déclenchés par un clic, pas un clic droit) restent des menus natifs — hors du périmètre demandé.

## [0.20.0] — 2026-07-13

### Modifié

- **Menu principal (les 3 points) entièrement réécrit en bulle flottante, comme le menu de dossier de favoris — plus un menu natif.** Après plusieurs échecs à positionner précisément un `Menu.buildFromTemplate` natif (Electron n'expose aucun moyen d'interroger sa largeur réelle avant affichage — toute estimation manuelle s'est révélée peu fiable), le menu principal est désormais une bulle DOM dans la même fenêtre popup flottante que les autres bulles (infos de site, traduction, dossier de favoris) : elle mesure sa vraie taille et s'ancre avec précision, bord droit contre bord droit du bouton. Sous-menus (Rechercher et modifier, Caster et partager, Plus d'outils, Zoom, Aide) navigables par un panneau qui se remplace (bouton retour), comme la bulle de traduction. Comportement inchangé pour l'utilisateur : mêmes entrées, mêmes raccourcis, ouverture/fermeture au clic sur le bouton, fermeture au clic extérieur/Échap.

## [0.19.7] — 2026-07-13

### Corrigé

- **Menu principal (les 3 points) toujours mal placé après le premier correctif** : le clampage dans l'écran (v0.19.6) ne changeait rien puisque le menu restait déjà techniquement à l'écran — le vrai problème est que le bouton n'a simplement pas 320px de marge à sa gauche dans une fenêtre pas assez large, donc aligner son bord droit dessus le décroche visuellement du bouton. Nouveau repli : si l'alignement droit n'a pas la place, le menu s'aligne sur le bord GAUCHE du bouton à la place — il touche désormais TOUJOURS le bouton d'un côté ou de l'autre.
- **Recliquer sur le bouton du menu principal ne le refermait plus** : le clic rouvrait toujours un nouveau menu au lieu de fermer celui déjà affiché. Corrigé en gardant une référence au menu ouvert et en le fermant (`closePopup`) sur un reclic — même bascule que la bulle du dossier de favoris.

## [0.19.6] — 2026-07-13

### Corrigé

- **Menu principal (les 3 points) qui s'ouvrait n'importe où, loin du bouton** : son calcul de position suppose le bouton collé au bord droit de la fenêtre (pour aligner le bord droit du menu dessus) — or le sélecteur de profil et les contrôles de fenêtre le suivent encore à droite, donc ce n'est pas le cas. Dans une fenêtre pas assez large, le menu (320px estimés) se retrouvait poussé bien au-delà du bord gauche de l'écran, où l'OS le repositionnait de façon imprévisible. Corrigé en clampant la position dans la zone de travail réelle de l'écran (même filet de sécurité que les popups de site/traduction/dossier).

## [0.19.5] — 2026-07-13

### Corrigé

- **Bulle de contenu d'un dossier de favoris mal alignée** : elle s'ouvrait centrée sous sa pastille au lieu d'aligner son bord gauche avec le bord gauche du bouton. Nouveau positionnement `below-left` (à côté de `below-right`/`below-center` déjà utilisés par les infos de site/traduction/aperçu d'onglet) — cohérent avec le menu principal (les 3 points, déjà aligné à droite sous son bouton) et les menus contextuels natifs (clic droit sur un favori/dossier, qui suivent le curseur, comportement standard déjà correct).

## [0.19.4] — 2026-07-13

### Corrigé

- **Curseur « interdit » en déposant un favori à droite du dernier favori de la barre (zone vide, sans autre favori après)** : cet espace vide héritait de la classe « zone de déplacement de fenêtre » (`-webkit-app-region: drag`) de la barre, qui entre en conflit avec le glisser-déposer HTML5 — Electron/Chromium traite la zone comme une poignée de fenêtre plutôt que comme une cible de dépôt valide. Les favoris eux-mêmes avaient déjà `no-drag`, mais pas l'espace vide autour. Corrigé en marquant toute la rangée de favoris `no-drag`.

## [0.19.3] — 2026-07-13

### Corrigé

- **La bulle DOM par-dessus la page (v0.19.2) produisait un rectangle noir** au lieu du contenu attendu — l'artefact de compositing redouté (une page web compose toujours au-dessus du DOM, quel que soit le z-index). Retour à une fenêtre popup native flottante pour le contenu d'un dossier de favoris (même mécanisme fiable que le menu principal/infos de site/traduction), ancrée sous la pastille du dossier. Contrepartie assumée : sortir un favori d'un dossier PENDANT que son popup est ouvert se fait via clic droit → « Déplacer vers » → « Sans dossier » plutôt que par glisser (le glisser-déposer entre deux fenêtres Electron distinctes reste peu fiable) — réordonner à l'intérieur du popup et déposer un favori sur la pastille d'un dossier (depuis la barre) continuent de fonctionner par glisser normalement.
- **Repositionner un favori tout à une extrémité de la barre exigeait de relâcher précisément sur le trait d'insertion**, en particulier quand la barre est pleine (aucun espace vide après le dernier favori). La zone de dépôt qui compte comme « tout au début »/« tout à la fin » est maintenant élargie (30% de la largeur du favori concerné, au lieu de 50%) — plus besoin de viser pile la moitié exacte.

## [0.19.2] — 2026-07-13

### Corrigé

- **Glisser-déposer d'un favori exigeant parfois deux essais / le plaçant au mauvais endroit** : un dépôt qui atterrissait dans l'interstice ENTRE deux favoris (le petit espacement du flex, qui n'appartient à aucun bouton) remontait jusqu'au conteneur entier et se rabattait sur « ajouter en fin de liste » au lieu d'insérer précisément — d'où l'impression que « ça n'a pas marché » au premier essai. Corrigé en calculant désormais la position d'insertion la plus proche du curseur (voir `nearestContainerIndex`) au lieu de toujours ranger en fin de liste, y compris pendant le survol (l'indicateur visuel suit maintenant aussi les dépôts dans les interstices).

### Modifié

- **Contenu d'un dossier de favoris : vraie bulle flottante par-dessus la page, plus une rangée qui pousse le contenu vers le bas.** Ancrée juste sous la pastille du dossier, coins arrondis, ombre — reste un élément DOM de la fenêtre principale (le glisser-déposer HTML5 n'a jamais besoin de traverser une frontière de fenêtre Electron, contrairement à l'ancien popup natif abandonné en v0.18). Comme une page web (`WebContentsView`) compose toujours au-dessus du DOM, sa borne haute recule temporairement le temps que la bulle est ouverte, mesurée dynamiquement pour coller à la hauteur réelle de la bulle.

## [0.19.1] — 2026-07-12

### Corrigé

- **Réordonnancement des favoris qui atterrissaient parfois une case trop
  loin** : l'index de dépôt était calculé sur la liste complète du conteneur
  (favori déplacé toujours dedans), puis ce favori était retiré avant
  insertion sans corriger l'index — ce qui décalait toutes les positions
  suivantes d'un cran. Le bug ne se manifestait QUE lors d'un déplacement
  vers une position située après la position d'origine du favori, dans le
  même conteneur (barre ou dossier). Corrigé en compensant ce décalage dans
  `commitMove`.

## [0.19.0] — 2026-07-12

### Modifié

- **Glisser-déposer des favoris entièrement réécrit — un vrai système,
  dans tous les sens** : réordonner précisément deux favoris (un indicateur
  visuel montre exactement où le favori glissé va s'insérer), le déplacer
  dans ou hors d'un dossier, le réordonner à l'intérieur d'un dossier —
  tout cela fonctionne maintenant de façon fiable, y compris en le déposant
  n'importe où sur la barre (pas seulement sur un autre favori).
- **Le contenu d'un dossier ne s'ouvre plus dans un popup séparé** : il
  s'affiche en ligne, dans une seconde rangée sous la barre, toujours dans
  la même fenêtre. Cause du changement : le popup précédent obligeait tout
  glisser-déposer vers/depuis un dossier à traverser une frontière entre
  deux fenêtres Electron, ce qui s'est révélé peu fiable (curseur
  « interdit » même au-dessus d'un favori existant, confirmé par capture
  d'écran). Une seconde rangée dans la même fenêtre élimine ce problème à
  la racine — le glisser-déposer HTML5 reste toujours dans le même document.

## [0.18.3] — 2026-07-12

### Modifié

- **Sortir un favori d'un dossier — abandon du glisser-déposer** : une
  capture d'écran a confirmé que le curseur affiche « interdit » même en
  survolant un favori déjà présent dans la barre — le glisser-déposer entre
  deux fenêtres Electron distinctes (le popup d'un dossier → la fenêtre
  principale) n'est pas fiable dans cette configuration. Remplacé par un
  bouton dédié (icône dossier-sortant, visible au survol de chaque favori
  dans le popup) qui range le favori hors du dossier en un clic — le clic
  droit → « Déplacer vers » → « Sans dossier » reste disponible en plus.

## [0.18.2] — 2026-07-12

### Corrigé

- **« Sans dossier » et le dossier réel d'un favori cochés en même temps**
  dans le menu « Déplacer vers » (clic droit) : un séparateur entre les deux
  cassait le regroupement automatique des boutons radio d'Electron (deux
  groupes séparés, chacun pouvant avoir sa propre coche, au lieu d'un seul
  groupe qui s'exclut mutuellement). Séparateur retiré.
- **Glisser-déposer un favori hors d'un dossier ne fonctionnait que si on le
  déposait exactement sur un autre favori**, pas dans l'espace vide de la
  barre : la barre n'avait aucun arrière-plan réellement peint sur toute sa
  largeur, ce qui semble empêcher la détection de dépôt lors d'un
  glisser-déposer entre deux fenêtres Electron distinctes (le popup d'un
  dossier → la barre). Un arrière-plan discret (`bg-void/40`) couvre
  maintenant toute la barre.

## [0.18.1] — 2026-07-12

### Corrigé

- **Le popup d'un dossier de favoris ne se refermait jamais** (ni au reclic,
  ni au clic ailleurs) : la pastille de dossier ouvrait le popup sans
  jamais gérer son état d'ouverture/fermeture, contrairement aux autres
  popups natifs de l'app (infos de site, traduire) — un oubli corrigé en lui
  donnant le même cycle de vie (bascule au clic, fermeture au clic extérieur
  ou dans une page, touche Échap).
- **Un favori sorti d'un dossier par glisser-déposer réapparaissait tout à
  gauche de la barre** au lieu de s'ajouter à la suite des autres : il
  gardait sa vieille position (héritée d'avant son rangement dans le
  dossier). Il reçoit maintenant une position fraîche, en fin de liste.
- **Déposer un favori dans la partie vide de la barre ne fonctionnait pas**
  (seulement en le déposant directement sur un autre favori) : la zone de
  dépôt était limitée à la rangée interne des favoris, qui ne couvre pas
  tout l'espace visuel de la barre. Élargie à la barre entière.
- **Le popup d'un dossier restait figé après un glisser-déposer** (fallait
  fermer/rouvrir plusieurs fois pour voir un favori disparaître) : le popup
  vit dans une fenêtre séparée de la fenêtre principale et ne recevait
  jamais les mises à jour — celles-ci ne partaient que vers la fenêtre
  principale. Relayées maintenant aussi vers le popup s'il est ouvert.

## [0.18.0] — 2026-07-12

### Modifié

- **Contenu d'un dossier de favoris, débordement de la barre, actions d'un
  dossier — réécrits sans aucun dropdown DOM**, après trois correctifs
  successifs (no-drag, masquage des vues, z-index) qui n'ont pas suffi.
  Cause structurelle : tout dropdown positionné juste sous la barre de
  favoris chevauche la zone où commence la vue native de la page active, qui
  compose toujours au-dessus du DOM — un problème que ce projet a déjà
  rencontré et résolu ailleurs (infos de site, aperçu d'onglet) via une
  fenêtre popup native séparée plutôt qu'un rafistolage CSS. Cliquer une
  pastille de dossier ouvre maintenant ce même genre de popup natif ; la
  flèche de débordement et le clic droit sur un dossier (renommer/supprimer)
  ouvrent un menu natif Electron — deux mécanismes déjà éprouvés ailleurs
  dans l'app, structurellement immunisés contre ce problème puisqu'ils ne
  vivent pas dans le DOM de la fenêtre principale.
- **Glisser un favori hors d'un dossier** : la voie fiable est maintenant le
  clic droit sur le favori → « Déplacer vers » → « Sans dossier » (menu
  natif déjà existant). Le glisser-déposer reste câblé depuis le nouveau
  popup vers la barre si le glisser inter-fenêtres d'Electron le permet, mais
  n'est plus le seul moyen d'y arriver.

## [0.17.4] — 2026-07-12

### Corrigé

- **Favoris dans un dossier, cause réelle enfin trouvée** : la barre de
  favoris n'avait pas de `z-index` explicite, alors que le conteneur de
  contenu (juste à côté dans la mise en page) en a un — en CSS, un élément
  avec un `z-index` positif l'emporte toujours sur une sœur sans `z-index`,
  quel que soit l'ordre du DOM. Le panneau déroulant d'un dossier (visible,
  mais perdant la bataille de superposition) laissait donc les clics dans la
  zone de chevauchement filer vers le contenu en dessous au lieu du bouton
  du favori — d'où l'illusion « ça ferme le dossier sans rien ouvrir ». Les
  deux correctifs précédents (`no-drag`, masquage des vues) étaient de vrais
  correctifs mais pour des problèmes différents, pas la cause réelle ici.
- **Glisser-déposer hors d'un dossier, cause réelle** : les favoris affichés
  DANS le panneau d'un dossier ouvert (et dans le menu de débordement)
  n'avaient tout simplement pas les attributs `draggable`/`onDragStart` —
  contrairement aux favoris de premier niveau dans la barre. Aucune
  opération de glisser ne pouvait même démarrer depuis ces panneaux.
- **Popup Traduire qui se ferme encore sur « Afficher l'original »** :
  `untranslate()` recharge la page (v0.17.2) — ce rechargement redonne le
  focus à la page une fois chargée, un focus purement programmatique
  indiscernable d'un vrai clic utilisateur pour le mécanisme qui ferme le
  popup au clic dans une page. Le tout prochain focus de la page est
  maintenant explicitement ignoré après un `untranslate()`, avec un filet de
  sécurité si la page ne recharge jamais.

## [0.17.3] — 2026-07-12

### Corrigé

- **Favoris dans un dossier toujours inertes (clic et glisser-déposer)** : le
  vrai coupable n'était pas `no-drag` (corrigé sans effet la fois précédente)
  mais la vue native de la page, qui commence juste sous la barre de favoris
  et compose PAR-DESSUS tout panneau déroulant qui déborde dans cette zone —
  elle avalait clics ET début de glisser-déposer avant qu'ils n'atteignent le
  panneau. Les vues sont maintenant masquées le temps qu'un panneau de la
  barre de favoris (dossier ouvert, débordement) reste ouvert, exactement
  comme pour un overlay plein écran — l'interaction est brève, contrairement
  aux popovers gardés ouverts en travaillant (infos de site…).
- **« Afficher la page originale » ferme le popup de traduction** : il reste
  maintenant ouvert (comme la bulle native de Chrome/Brave), l'état revient
  simplement à « Traduire » — permet de retraduire immédiatement sans rouvrir
  le popup.

## [0.17.2] — 2026-07-11

### Corrigé

- **« Afficher la page originale » sans effet** : la restauration se faisait
  via un instantané du DOM (`innerHTML`) réappliqué sans recharger — un site
  qui gère lui-même son affichage (SPA React/Vue…) peut re-rendre par-dessus
  ce remplacement, donnant l'impression que le bouton ne faisait rien.
  Remplacé par un vrai rechargement de la page, fiable dans tous les cas.
- **Cliquer un favori dans un dossier (ou dans le menu de débordement) ne
  l'ouvrait pas** : les panneaux déroulants de la barre de favoris (dossier
  ouvert, débordement, actions d'un dossier) n'étaient pas marqués
  « hors zone de déplacement de fenêtre » — leurs boutons héritaient donc du
  comportement de la barre de titre (qui sert aussi à déplacer la fenêtre),
  qui absorbait le clic avant qu'il n'atteigne le bouton.
- **Glisser un favori HORS d'un dossier (pour le sortir) ne faisait rien** :
  seuls les dossiers acceptaient un dépôt ; la barre elle-même n'avait pas de
  zone de dépôt. Déposer un favori sur la barre (hors d'un dossier) le sort
  maintenant de son dossier — symétrique du glisser-déposer vers un dossier.

### Modifié

- **Longueur maximale d'un favori réduite** (256px → 128px) : certains
  titres trop longs prenaient une place disproportionnée dans la barre.
- **Espace vide à droite de la flèche de débordement supprimé** : la flèche
  colle maintenant au bord droit de la zone de défilement au lieu de rester
  collée au dernier favori visible, quelle que soit la largeur restante.
- **Texte pré-sélectionné à l'ouverture de la barre d'Intention** — comme
  n'importe quel navigateur : taper remplace immédiatement l'URL ou le texte
  pré-rempli, au lieu de devoir d'abord tout sélectionner à la main.

## [0.17.1] — 2026-07-11

### Ajouté

- **Popup Traduire, menu d'options (⋮)** : choisir une autre langue cible à
  tout moment (même après avoir déjà traduit — le sélecteur se figeait
  auparavant une fois la traduction lancée), corriger la langue source si
  la détection automatique s'est trompée (ex. anglais détecté à la place de
  l'allemand — force le paramètre `sl` envoyé au service de traduction au
  lieu de `auto`), et « Ne jamais traduire ce site » (le bouton Traduire
  disparaît définitivement pour ce domaine).

## [0.17.0] — 2026-07-11

### Modifié

- **Traduction de page réécrite de zéro — plus aucune trace du widget
  Google** (banni après 3 correctifs infructueux sur sa bannière). Deux
  agents de recherche dédiés ont confirmé que ce widget mêle sa bannière et
  sa logique interne au point de rendre le combo « traduction qui marche +
  bannière invisible » structurellement instable. Nouvelle approche 100 %
  maison : ÆTHER parcourt lui-même le texte visible de la page, interroge
  directement l'API de traduction (sans charger aucun script ni UI Google),
  puis remplace le texte en place. Aucune bannière n'est plus possible,
  puisque rien de Google n'est jamais injecté dans la page — seul le popup
  natif ÆTHER (déjà en place) pilote l'opération. « Afficher l'original »
  est aussi devenu instantané (restauration depuis un instantané du DOM,
  sans recharger la page).

## [0.16.2] — 2026-07-11

### Corrigé

- **Traduire ne faisait plus rien** : le fix précédent (v0.16.1) supprimait
  activement la bannière Google du DOM (`el.remove()`) pour la faire
  disparaître — mais cette bannière porte apparemment une partie de la
  logique interne du widget, et la détruire cassait la traduction elle-même
  (plus de bannière, mais plus de traduction non plus). Remplacé par un
  masquage non destructif : l'élément reste dans le DOM (donc son
  fonctionnement interne n'est jamais interrompu), seul son style est forcé
  en invisible via `!important` inline — réappliqué en continu (observateur
  + filet périodique) pour gagner face à un éventuel style que Google
  réimpose lui-même. Le conteneur du widget est aussi passé de `display:none`
  à une simple position hors écran, par précaution (un conteneur sans mise
  en page réelle peut faire échouer silencieusement l'initialisation de
  certains widgets tiers).

## [0.16.1] — 2026-07-11

### Corrigé

- **Popup de traduction : bouton « Traduire » bloqué après un retour à
  l'original** : `runRestore` marquait l'action « en cours » (`busy`) mais ne
  le redéfinissait jamais à `false`, donc le bouton Traduire réapparaissait
  DÉSACTIVÉ au réouverture du popup — impossible de retraduire.
- **Bannière Google Traduction toujours visible dans la page** malgré le CSS
  ajouté en v0.16.0 : un simple `display: none` ne suffit pas, Google
  réinsère/repositionne son iframe après le chargement du widget. Remplacé
  par une suppression active du DOM (`MutationObserver` + filet
  `setInterval`) qui retire la bannière dès qu'elle apparaît, au lieu
  d'essayer de la neutraliser en CSS.
- **`untranslate` durci** : recharge maintenant en ignorant le cache
  (`reloadIgnoringCache`) pour repartir d'un état totalement propre.

## [0.16.0] — 2026-07-11

### Supprimé

- **Langues de l'interface** : ÆTHER ne propose plus que le français pour
  sa propre interface (les 5 langues ajoutées en v0.13.0 représentaient trop
  de travail de maintenance pour un intérêt limité). Le correcteur
  orthographique garde, lui, son propre réglage de langues (inchangé,
  Réglages › Langues).

### Ajouté

- **Muse redimensionnable** : le panneau peut être élargi/rétréci en glissant
  son bord gauche, comme la Constellation — largeur mémorisée entre sessions.

### Modifié

- **Bouton Traduire, popup natif façon Chrome/Brave** : la traduction
  n'affiche plus rien DANS la page (ni redirection `translate.goog`, ni
  bannière Google — jugées « pas pro »). Un clic sur l'icône « Traduire »
  ouvre un popup natif ÆTHER (langue détectée, choix de la langue cible,
  bouton Traduire/Afficher l'original), exactement comme l'icône native de
  Chrome/Brave ancrée à la barre d'adresse. La traduction elle-même utilise
  toujours le widget public Google (seul mécanisme accessible hors de
  Chromium), mais sa bannière est masquée par CSS — rien de visible dans la
  page, seul le popup ÆTHER pilote l'opération. Limite honnête inchangée :
  un site à Content-Security-Policy stricte peut bloquer le script Google
  injecté (l'intégration native de Chrome/Brave vit dans le moteur Chromium
  lui-même, hors de portée d'Electron).

### Corrigé

- **Bouton étoile (ajouter aux favoris) sans effet** : durcissement du
  chemin d'erreur (`toggleFavorite`) pour afficher un message si l'appel
  échoue au lieu d'échouer silencieusement — utile si la base n'a pas encore
  appliqué la migration des favoris (v0.15.0), résolu par un redémarrage
  complet de l'application.

## [0.15.0] — 2026-07-11

### Modifié

- **Les favoris sont maintenant une entité à part entière**, indépendante des
  onglets — comme un vrai signet Chrome. Au tour précédent, ajouter un favori
  puis fermer son onglet rendait l'onglet impossible à fermer pour de bon (sa
  ligne restait affichée dans la bande de pages, faute d'être filtrée par
  emplacement Focus). Un favori vit maintenant dans sa propre table, avec sa
  propre copie de l'URL/titre/favicon : fermer l'onglet le ferme toujours
  complètement, le favori survit tel quel.

### Ajouté

- **Longueur maximale de la barre de favoris** : au-delà de la largeur
  disponible, les favoris en trop basculent dans un menu déroulant (flèche en
  fin de barre) au lieu de forcer un défilement horizontal.
- **Dossiers affichés directement dans la barre de favoris** (pastille avec
  compteur) : clic pour dérouler son contenu, glisser-déposer un favori
  dessus pour le ranger, clic droit pour renommer/supprimer le dossier.
- **Menu contextuel natif sur un favori** (clic droit, barre ou menu
  déroulant) : ouvrir, copier le lien, déplacer vers un dossier, retirer des
  favoris.

## [0.14.0] — 2026-07-11

### Ajouté

- **Dossiers de favoris** (façon chrome://bookmarks) : créer, renommer,
  supprimer un dossier, y ranger un favori (menu contextuel « Déplacer
  vers » ou sélecteur dans la page de gestion) — un favori supprimé de son
  dossier redevient simplement « sans dossier ».
- **Animation du glisser-déposer des onglets** : les onglets glissent
  maintenant en douceur les uns par rapport aux autres pendant un
  réordonnancement, au lieu de sauter instantanément à leur nouvelle place.

### Corrigé

- **Thème clair, encore** : le blanc pur (#ffffff) posé au tour précédent
  fatiguait les yeux et effaçait la distinction entre surfaces (« on voit mal
  les éléments »). Nouvelle palette : fond légèrement plus terne
  (`#f8f8f6`, confort visuel façon papier) et surfaces élevées (cartes,
  panneaux) en blanc pur — cette différence crée le relief qui manquait.
  Les bordures statiques (pas seulement au survol) sont de nouveau
  redirigées vers une teinte visible, sans quoi les contours de panneaux
  disparaissaient complètement sur fond clair.
- **Texte des favoris tronqué inutilement** dans la barre de favoris : la
  largeur maximale (128px) coupait des noms qui tenaient largement dans
  l'espace disponible — portée à 256px.
- **Un favori disparaissait à la fermeture de son onglet** : fermer une page
  supprimait purement et simplement sa ligne en base, favori compris. Un
  favori se comporte maintenant comme un vrai signet : fermer son onglet ne
  fait que décharger sa vue (comme une éviction mémoire normale), la page et
  son statut de favori restent.
- **Bulle d'info de site/aperçu d'onglet qui se figeait parfois, apparition
  toujours saccadée** : le délai fixe ajouté au tour précédent pour éviter le
  scintillement créait une course avec un survol rapide (un `hide()` pouvait
  arriver avant l'expiration du délai, puis l'affichage différé s'exécutait
  quand même ensuite → la bulle réapparaissait toute seule). Remplacé par un
  vrai signal « le contenu a fini de se peindre » (le `ResizeObserver` du
  renderer, qui remonte déjà la taille réelle) plutôt qu'un délai deviné.

## [0.13.0] — 2026-07-11

### Ajouté

- **Interface traduite en 5 langues** (Réglages › Langues) : français, anglais,
  espagnol, allemand, italien — traduction complète et soignée de tout
  l'interface (barre de titre, réglages, panneaux, menus, guide, accueil),
  y compris le menu principal natif. Change uniquement l'appli elle-même,
  jamais la langue des pages web visitées (réglage distinct des « langues du
  correcteur » ajouté au tour précédent).
- **Bouton Traduire cette page** (barre de titre + menu principal) : bascule
  la page active sur son équivalent traduit via le proxy public
  `translate.goog` de Google — la vraie extension Chrome n'étant pas
  accessible hors de Chrome, c'est le mécanisme le plus proche pour un
  navigateur tiers.

### Corrigé

- **Thème clair encore gris** : `--color-void`/`--color-abyss` valaient déjà
  un gris clair (`#f2f3f7`/`#fbfbfd`) avant même le correctif du tour
  précédent — passés à un blanc quasi pur.
- **Interrupteurs (toggle) à peine visibles décochés** : opacité de
  `--color-toggle-track` largement augmentée dans les deux thèmes
  (particulièrement le clair, 0.16 → 0.38).
- **Scintillement des bulles (infos de site, aperçu d'onglet) à l'apparition** :
  la fenêtre popup native devenait visible avant que le nouveau contenu ait
  fini de se peindre, montrant un reste de l'ancien état — l'affichage est
  désormais différé d'une frame après l'envoi du contenu.

## [0.12.0] — 2026-07-11

### Ajouté

- **Langues du correcteur orthographique** (Réglages › Langues) : une
  quinzaine de langues majeures sélectionnables simultanément (français,
  anglais US/UK, espagnol, allemand, italien, portugais BR/PT, russe,
  chinois, japonais, coréen, arabe, hindi, néerlandais, polonais, turc) —
  sans sélection, ÆTHER garde la détection automatique du système.

### Corrigé

- **Thème clair redevenu gris** : le correctif de contraste d'un tour
  précédent redirigeait aussi les fonds `bg-white/[0.0N]` codés en dur au
  REPOS (pas seulement au survol) vers un tint noir — correct pour le
  feedback de survol invisible que ça visait à l'origine, mais cumulé sur
  des dizaines de panneaux/cartes qui les utilisent comme fond par défaut,
  ça posait un voile gris permanent sur toute l'interface. Seules les
  variantes `hover:` sont maintenant redirigées ; les fonds au repos
  retrouvent leur blanc quasi invisible (comportement voulu d'un thème clair).
- **Interrupteurs (toggle) devenus très sombres/grisés en thème clair** :
  leur piste « désactivée » utilisait un blanc translucide fixe
  (`bg-white/10`), invisible sur fond clair — nouveau token
  `--color-toggle-track`, adapté à chaque thème.
- **Profil « Navigation privée » qui restait dans Paramètres › Profils** une
  fois qu'on en ressortait : seule la session (cookies) était éphémère, pas
  les métadonnées du profil (espaces, pages, notes), stockées comme un
  profil normal. Le profil privé est maintenant supprimé automatiquement dès
  qu'on bascule vers un autre profil (et, filet de sécurité, à la fermeture
  de l'application si aucun changement de profil n'a eu lieu entre-temps).

## [0.11.0] — 2026-07-10

### Ajouté

- **Panneau Espaces (Constellation) redimensionnable** : glisser son bord
  droit pour l'élargir/rétrécir (220–480px), largeur mémorisée entre les
  sessions.
- **Bulle « N pages » en mode Toile** (coin haut-droit, semi-permanente) :
  repliée par défaut, dépliable pour lister toutes les pages de l'espace
  avec un filtre — cliquer une page aimante la caméra dessus.

### Corrigé

- **[Urgent] Taille des textes de l'interface qui rognait le bas de l'appli
  (agrandi) ou laissait un rectangle noir en bas (réduit)** : la propriété
  `zoom` appliquée directement sur `<html>` rescale aussi les unités
  `vh`/`vw` de CET élément par rapport à la fenêtre réelle — une mise en page
  `h-screen` (100vh) devient donc 100vh × échelle de pixels RÉELS,
  débordant en bas si l'échelle > 100 %, laissant un vide non couvert si
  < 100 %. Fix : `zoom` déplacé sur un wrapper dédié (`UiScaleRoot`) dont la
  taille (avant zoom) est calculée comme fenêtre ÷ échelle, pour qu'une fois
  zoomée elle occupe exactement la fenêtre réelle, quelle que soit
  l'échelle choisie.
- **Bouton + de la bande de pages qui s'éloignait des onglets** : les
  onglets utilisaient `flex-1` (grandissent ET rétrécissent) au lieu de
  rétrécir seulement — avec peu d'onglets, ils s'étiraient pour combler
  l'espace libre et poussaient le bouton + loin à droite. Retiré la
  croissance : les onglets gardent leur largeur naturelle (rétrécissant
  uniquement s'ils sont nombreux), le bouton + reste toujours collé à leur
  suite.

## [0.10.0] — 2026-07-10

### Ajouté

- **Menu principal de l'application** (icône ⋮ dans la barre de titre, façon
  Chrome/Edge/Brave) : Nouvel onglet, Navigation privée, Favoris et listes,
  Historique, Téléchargements, Extensions, sous-menus **Rechercher et
  modifier** (Ctrl+F, Copier/Coller/Couper), **Caster et partager**
  (Enregistrer la page sous…, Copier le lien, Créer un QR code, Capture
  d'écran), **Plus d'outils** (Recherche dans les onglets, Nommer la
  fenêtre, Personnaliser ÆTHER, Performances, Gestionnaire de tâches, Outils
  de développement), Supprimer les données de navigation, Zoom, Imprimer,
  sous-menu **Aide** (À propos, Centre d'aide, Signaler un problème),
  Paramètres, Quitter.
- **Recherche dans la page (Ctrl+F)** : barre locale avec compteur de
  correspondances, précédent/suivant — insérée entre l'en-tête de l'onglet
  et la vue web, jamais recouverte par celle-ci.
- **Recherche dans les onglets** (Ctrl+Maj+A) : palette filtrable listant
  toutes les pages ouvertes, tous espaces confondus.
- **Gestionnaire de tâches** : mémoire de travail réelle par page, avec
  fermeture directe.
- **QR code** de la page active, généré localement, avec export en image.
- **Enregistrer la page sous…** et **Capture d'écran**, via un sélecteur
  d'emplacement natif.
- **Nommer la fenêtre** : renomme le titre OS (barre des tâches, Alt+Tab).
- **Page dédiée de gestion des favoris** (façon chrome://bookmarks), groupée
  par espace, plus **menu contextuel clic droit** sur un favori (Ouvrir,
  Copier le lien, Retirer, Gérer les favoris…) et son icône d'accès dédiée.
- **Page d'historique complète**, groupée par jour.
- **Popup de zoom interactif** (boutons −/+/réinitialiser, comme dans un
  navigateur classique) et **plage étendue à 25 %–500 %** (paliers façon
  Chrome) au lieu des anciens incréments bruts de niveau de zoom.
- **Imprimer** la page active (Ctrl+P) via le dialogue natif.

### Corrigé

- **Panneaux (Réglages, Téléchargements, Favoris, Historique) qui débordaient
  de l'écran à une taille de texte d'interface élevée**, rendant leur bouton
  de fermeture inatteignable : la hauteur fixe en pixels ne s'adaptait pas à
  la fenêtre réelle — remplacée par une hauteur plafonnée en `vh`, comme la
  largeur l'était déjà.
- **Troncature des noms d'onglets/pages en `…`** remplacée par un fondu en
  dégradé (moins agressif visuellement, ne mange pas davantage de texte) —
  bande de pages, barre de favoris, cartes de la toile, pilule d'adresse,
  survol de la Constellation.
- **Contraste global insuffisant** (surtout en thème clair, difficile à
  lire) : couleurs `ink-dim`/`ink-faint` resserrées sur la norme AAA/AA, et
  correction des dizaines de surcouches `hover:bg-white/[...]` codées en dur
  qui restaient quasiment invisibles sur fond clair.
- **Alignement du menu principal** sur le bord droit de son bouton.

## [0.9.0] — 2026-07-10

### Ajouté

- **Réglage de taille des textes de l'interface** (Réglages › Apparence) :
  agrandit ou réduit toute l'interface ÆTHER (barre de titre, panneaux,
  textes, icônes) de 85 % à 130 %, harmonieusement, sans toucher au contenu
  des pages web (qui garde son propre réglage de zoom indépendant).
- **Vitesse et temps restant** affichés à la fois dans l'infobulle de
  l'icône de téléchargement et dans le panneau complet, pour chaque
  téléchargement en cours.
- **Regroupement par date** (Aujourd'hui, Hier, ou date précise) dans le
  panneau des téléchargements — les lignes n'affichent plus que l'heure,
  le jour étant déjà porté par l'en-tête de section.

### Corrigé

- **Infobulle de l'icône de téléchargement qui scintille** : le `title`
  natif change à chaque tick de progression, ce qui réinitialise et fait
  clignoter le tooltip du navigateur au lieu de rester stable. Remplacé par
  une infobulle custom en DOM (même famille visuelle que les popovers),
  stable au survol prolongé.
- **Étincelle décorative de la barre d'adresse retirée** : elle faisait
  doublon avec le bouton dédié qui ouvre/ferme Muse, déjà présent dans la
  barre de titre.
- **Bande de pages avec un scroll vertical parasite** : `overflow-x-auto`
  impose implicitement `overflow-y: auto` (CSS2.1) dès qu'un enfant déborde
  ne serait-ce que d'1px — `overflow-y-hidden` explicite ajouté pour
  neutraliser ce comportement par défaut.
- **Bouton + parfois poussé hors champ** : sorti de la zone défilante des
  onglets, toujours visible désormais. Les onglets se partagent l'espace
  disponible et rétrécissent ensemble (`flex-1` avec min/max-width) plutôt
  que de forcer un défilement horizontal.
- **Délai d'affichage de la bulle d'onglet trop court** (400 ms → 700 ms).
- **« Page non chargée » au survol de nombreux onglets** : comportement
  attendu (≤6 pages ont une vue native vivante à la fois, cf. cache LRU du
  `ViewManager`) — le message a été clarifié (« En veille — aucune vue
  active ») pour ne plus laisser croire à un bug.

## [0.8.0] — 2026-07-10

### Ajouté

- **Icône selon le type de fichier** dans l'historique des téléchargements
  (image, vidéo, audio, archive, tableur, document…) au lieu d'une icône
  générique unique.
- **Horodatage avec le jour explicite** (« Aujourd'hui, 19:31 », « Hier,
  14:02 », ou « vendredi 10 juil., 09:15 ») à la place du vague « il y a X ».
- **Détection d'un fichier supprimé du disque** : vérifié à l'ouverture du
  panneau puis toutes les 4 s tant qu'il reste ouvert — le nom s'affiche
  barré avec la mention « Supprimé », les actions d'ouverture disparaissent.
- **Bouton copier le lien de téléchargement**, à la place de l'ancien bouton
  « ouvrir le fichier » — le nom du fichier s'ouvre désormais au clic direct.
- **Bouton croix sur chaque ligne** de l'historique, pour retirer l'entrée
  (annule d'abord le téléchargement s'il est encore en cours).
- **Infobulle au survol prolongé de l'icône de téléchargement** : nom du
  fichier, progression en Ko/Mo/Go et temps restant estimé.

### Corrigé

- **Anneau de progression de l'icône de téléchargement pas du tout centré** :
  le SVG portait à la fois des attributs `width`/`height` HTML fixes et un
  positionnement `absolute inset-0` — un système sur-contraint que les
  navigateurs résolvent en ignorant l'étirement, callant l'anneau dans le
  coin haut-gauche du bouton au lieu de le centrer. Retiré les attributs
  fixes au profit de `h-full w-full`, qui épouse enfin la taille réelle du
  bouton (vérifié : le rectangle du SVG correspond maintenant exactement à
  celui du bouton).
- **L'anneau n'avançait pas** : certains téléchargements ne renvoient pas de
  taille totale connue (`Content-Length` absent), ce qui bloquait le calcul
  de progression à 0 en permanence — désormais ces téléchargements sont
  exclus du calcul (s'il y en a d'autres avec une taille connue) ou, si
  aucun téléchargement actif n'a de taille connue, l'anneau bascule en mode
  indéterminé (rotation continue) plutôt que de rester figé.

## [0.7.0] — 2026-07-10

### Ajouté

- **Indicateur de zoom** : un badge (« 125 % ») apparaît brièvement en haut de
  l'écran à chaque changement de niveau de zoom (Ctrl+±/0, Ctrl+molette).
- **Bouton + dans la bande de pages** : ouvre la Barre d'Intention pour
  démarrer une nouvelle page, juste à droite du dernier onglet.
- **Centrage intelligent de la Toile** : en basculant en mode Toile depuis un
  onglet actif, la caméra se centre désormais sur cette page plutôt que de
  restaurer aveuglément la dernière position — vue d'ensemble si aucun onglet
  n'est actif.
- **Retour visuel des téléchargements** : l'icône de la barre de titre
  affiche désormais un anneau de progression en direct et vire au vert
  quelques secondes à la fin d'un téléchargement.

### Corrigé

- **Icône étincelle décorative dans la barre d'adresse** : ne faisait rien au
  clic. Elle bascule maintenant Muse (compagnon IA), sans déclencher
  l'ouverture de la Barre d'Intention (clic sur le reste de la pilule).
- **Champ « Demandez à Muse… » mal centré verticalement** : le conteneur
  utilisait `items-end` (pensé pour garder le bouton d'envoi en bas quand le
  texte s'étend sur plusieurs lignes), ce qui décalait le texte d'une ligne
  vers le bas de sa propre boîte. Recentré (`items-center`).
- **Bulle d'aperçu d'onglet figée si l'onglet est fermé pendant son
  affichage** (clic milieu ou croix pendant le survol) : rien ne demandait la
  fermeture du popup natif dans ce cas précis (ni focus d'une page, ni
  nouveau survol). Le popup et l'état local se referment désormais aussi à
  la fermeture de l'onglet survolé.

## [0.6.4] — 2026-07-10

### Corrigé

- **Bulle d'aperçu d'onglet collée à l'onglet** : espace entre l'ancre et le
  popup passé de 8 à 12px, un écart désormais clairement visible.
- **Popovers (infos de site, aperçu d'onglet) trop transparents** : le fond
  « verre » (`glass-strong`, flou + faible opacité) reposait sur un
  `backdrop-filter` qui n'a rien de fiable à flouter derrière une fenêtre
  popup native transparente — illisible par-dessus une page vivante. Nouveau
  fond `popover-surface`, quasi opaque et sans flou, réservé à ces fenêtres.
  Corrige aussi au passage l'absence de synchronisation du thème clair/sombre
  dans la fenêtre popup (contexte JS séparé de la fenêtre principale).
- **Barre d'adresse qui chevauchait les boutons (Focus/Toile, Aide, IA,
  téléchargements) sur une fenêtre réduite** : la pilule d'intention était en
  `position: absolute`, superposée par-dessus tout le reste de la barre de
  titre — sur une fenêtre étroite, elle passait purement et simplement
  au-dessus des boutons (aucun rapport avec les popovers de page : ceci est
  100 % DOM, un problème d'ordre d'empilement CSS). Remplacé par une grille
  à trois colonnes (`1fr auto 1fr`) : la pilule garde sa place centrale sans
  jamais recouvrir quoi que ce soit, le groupe de droite (contrôles
  essentiels, fenêtre comprise) ne rétrécit plus jamais sous sa taille
  naturelle, seul le nom de l'espace (groupe de gauche, décoratif) se
  tronque en premier quand la place manque.
- **Menu du profil qui passait derrière le contenu de la page** : même cause
  que les popovers de page (0.6.3) — un menu DOM ne peut pas s'afficher
  au-dessus d'une `WebContentsView`. Remplacé par un menu natif Electron
  (`Menu.buildFromTemplate`), ancré sous l'avatar, toujours au-dessus de
  tout. Les actions du menu (changer de profil, nouveau profil, navigation
  privée, gérer les profils) renvoient une commande à la fenêtre principale,
  qui exécute la même logique de rechargement de session qu'auparavant.
- **Ctrl+molette n'agrandissait pas la page** : Electron notifie le geste
  (`zoom-changed`) mais n'ajuste rien lui-même, contrairement à Ctrl+±/0 qui
  sont de vrais raccourcis clavier déjà câblés. Le niveau de zoom est
  désormais appliqué dans ce handler.

## [0.6.3] — 2026-07-10

### Corrigé

- **Le rectangle vide restait visible au-dessus de la page** : même sans
  animation (0.6.2), le rétrécissement local des bornes de la vue (0.6.0)
  laissait apparaître un bandeau rectangulaire vide dès qu'un popover
  (infos de site, aperçu d'onglet) s'ouvrait — parce qu'une `WebContentsView`
  compose *toujours* au-dessus du DOM, rétrécir ses bornes révèle
  nécessairement un rectangle à la place, quelle que soit la façon dont on
  l'anime ou pas. Ces deux popovers s'affichent désormais dans une **fenêtre
  popup native flottante**, distincte de la fenêtre principale et de la vue
  de page — elle compose par-dessus tout sans jamais toucher aux bornes de
  la page, qui reste donc pleinement visible et interactive en dessous, sans
  aucun rectangle ni gel.
- **Le popover ne se fermait pas en cliquant dans la page** : un clic sur le
  contenu d'une page (vidéo, etc.) pendant qu'un popover était ouvert
  n'atteignait jamais les détecteurs de clic-extérieur du popup (une vue de
  page est un processus de rendu séparé). Le popup se ferme maintenant aussi
  dès qu'une page reprend le focus.

## [0.6.2] — 2026-07-09

### Corrigé

- **La page glissait visiblement à l'ouverture/fermeture du popover d'infos de
  site** : le rétrécissement local de la vue (0.6.0) était animé (`transition
  top 150ms`) pour adoucir le changement — mais cette transition faisait
  glisser toute la vidéo/page en cours de lecture à chaque ouverture ou
  fermeture du popover, un mouvement inattendu et gênant sur le contenu
  lui-même. Le rétrécissement s'applique désormais instantanément, sans
  animation.

## [0.6.1] — 2026-07-09

### Corrigé

- **Capture figée en double par-dessus une page vivante** : le correctif du gel
  local (0.6.0) libère une bande en haut de la page pour laisser apparaître un
  popover (infos de site, aperçu d'onglet) sans figer toute la page — mais
  l'aperçu JPEG de secours (compressé, utilisé normalement quand la vue native
  est totalement absente) restait affiché en pleine taille dans cette bande,
  créant une capture basse qualité visiblement dédoublée par-dessus la vidéo en
  cours de lecture. L'aperçu de secours suit désormais le même rétrécissement
  que la vue native : la bande libérée est maintenant vide (fond uni) derrière
  le popover, plus aucun doublon.

## [0.6.0] — 2026-07-09

### Corrigé

- **Aperçu au survol de la bande de pages mal positionné** : la carte s'affichait
  systématiquement collée au bord gauche de la bande au lieu d'être centrée sous
  l'onglet survolé. Elle suit maintenant la position réelle de l'onglet (mesurée,
  reclampée aux bords de la bande).
- **Plein écran vidéo incomplet** : une page qui demandait le plein écran HTML5
  (lecteur vidéo…) ne s'agrandissait que dans la zone de contenu — Constellation,
  Muse et barre de titre restaient visibles, contrairement à un vrai navigateur.
  ÆTHER masque désormais toute sa propre interface et la page occupe l'écran en
  entier, taskbar Windows comprise (comme un plein écran de navigateur classique).
- **F11 ne faisait rien** : aucun raccourci n'était câblé, ni depuis l'interface
  ni depuis une page web focus. F11 bascule maintenant le plein écran natif de la
  fenêtre (masque la barre des tâches), qu'une page web ait le focus ou non.
- **Popovers locaux qui figeaient toute la page** : cliquer sur le cadenas
  (infos de site) ou survoler un onglet assez longtemps déclenchait un gel de
  toute la zone de page — remplacée par une capture JPEG compressée, plusieurs
  secondes pour revenir à un état interactif après un clic. Cause : ces popovers
  utilisaient le même mécanisme de masquage que les overlays plein écran
  (réglages, intention…), qui capture puis cache **toutes** les vues natives.
  Ces deux popovers rétrécissent maintenant localement les bornes de la seule
  vue concernée — la page reste vivante et interactive tout autour, sans capture
  ni gel, et se rétablit instantanément à la fermeture.

### Ajouté

- **Espaces — personnalisation complète** : clic droit sur un espace (barre
  Constellation) ouvre un menu contextuel natif — renommer, changer de couleur
  (8 teintes), dupliquer, nouvel espace, dissoudre (confirmation native). Clic
  molette = duplication rapide. La dissolution est désormais confirmée par une
  boîte de dialogue Windows native avant toute suppression irréversible.

### Note sur le versionnage

Comme demandé : les lots mêlant uniquement des correctifs isolés utiliseront
désormais le **correctif** (ex. `0.6.1`), réservant le **mineur** aux lots qui
ajoutent de nouvelles capacités (comme celui-ci, avec le plein écran et la
personnalisation des espaces).

## [0.5.0] — 2026-07-09

### Corrigé

- **Bande de pages — aperçu au survol invisible** : la bande portait `overflow-x-auto`
  sur son conteneur racine, ce qui force implicitement `overflow-y: auto` (règle CSS) —
  la carte d'aperçu, qui déborde volontairement sous la bande, se retrouvait rognée à
  0 px de haut. Seule la rangée d'onglets défile désormais ; le conteneur qui héberge
  l'aperçu n'a plus de restriction de débordement.
- **Popovers locaux masqués par les pages natives** : la `WebContentsView` (vue web
  native Electron) se compose toujours au-dessus du DOM, quel que soit le z-index —
  un popover ouvert au-dessus de la zone de contenu (infos de site, aperçu d'onglet)
  était donc invisible là où il chevauchait une page chargée. Ces popovers locaux
  masquent désormais les vues natives le temps d'être ouverts, comme les overlays
  globaux (réglages, intention…) le faisaient déjà.

### Ajouté

- **Bande de pages — interactions complètes façon navigateur** :
  - **Clic milieu** pour fermer un onglet directement dans la bande.
  - **Survol** d'un onglet actif : après un court délai, une carte affiche l'aperçu
    de la page (si activé dans Apparence), le titre, le domaine, l'état du son et la
    **mémoire utilisée** par le processus de rendu (ou « Page non chargée » si
    l'onglet n'est pas en mémoire).
  - **Clic prolongé + glisser** pour réordonner les onglets ; l'ordre est persisté
    (`pages.position` en base).
  - **Clic droit** ouvre un menu contextuel natif complet : nouvel onglet, couper le
    son, ajouter/retirer des favoris, actualiser, fermer l'onglet, fermer les autres
    onglets, fermer les onglets à droite, rouvrir le dernier onglet fermé (pile de 8).
  - Nouveau réglage **Apparence › Aperçu au survol des onglets**.
- **Informations de site** — icône cadenas/globe dans l'en-tête de chaque page ouvrant
  un popover façon Chrome :
  - État **HTTPS/HTTP** avec code couleur, et **certificat observé** en direct
    (émetteur, sujet, validité, empreinte) — capturé passivement via
    `setCertificateVerifyProc`, sans jamais décider soi-même de la confiance à
    accorder (la vérification Chromium reste seule décisionnaire).
  - **Autorisations par site** (caméra/micro, localisation, notifications) : surcharge
    par origine et par profil (autoriser / bloquer / suivre le réglage global),
    appliquée en direct aux futures demandes de permission du site.

### Modifié

- Onglets coupés au son : un petit repère apparaît dans la bande de pages, cliquable
  pour rétablir le son sans ouvrir la page.

## [0.4.0] — 2026-07-09

### Corrigé

- **Paramètres** : un bouton qui ouvrait une autre section pendant que le panneau était
  déjà affiché (ex. « Effacer les données de navigation » depuis Confidentialité) ne
  changeait pas de section — le state local ne se resynchronisait pas avec la demande.

### Ajouté

- **Paramètres réorganisés** : la section Labo (drapeaux) est retirée ; ses réglages
  rejoignent leurs catégories naturelles (accélération matérielle/expérimental →
  Performance ; thème sombre forcé/défilement/barres → Apparence). Une bannière
  persistante invite à relancer ÆTHER quand un réglage moteur change, où qu'on soit
  dans le panneau. Nouvelle section **Extensions**.
- **Profils — avatars** : trois modes (aucun / icône+couleur / image importée),
  éditables depuis Paramètres › Profils. Images stockées dans `userData/avatars/`,
  servies via `aether://avatars/`.
- **Apparence** : thème **clair** et suivi du **système**, en plus du sombre par
  défaut ; davantage de couleurs d'accent prédéfinies + **sélecteur personnalisé** ;
  **barre de favoris** (avec regroupement par espace) ; **barre d'Intention large** ;
  **bande de pages** en mode Focus — la traduction ÆTHER-native des onglets
  (vignettes cliquables, survol = aperçu agrandi, réutilise les captures existantes).
- **Recherche** : moteurs **personnalisés** (nom + URL avec `%s`), en plus des
  moteurs intégrés.
- **Confidentialité & Données** : suppression réelle par **plage temporelle** (dernière
  heure / 24 h / 7 j / 4 sem. / tout) avec cases à cocher — historique de navigation,
  cookies et données de site, cache, historique des téléchargements. Case « saisie
  automatique » volontairement absente : Electron n'implémente pas cette fonctionnalité
  de Chrome, mieux vaut le dire que simuler une suppression qui ne supprimerait rien.
- **Historique de navigation** : nouvelle table dédiée (distincte des pages persistantes
  de la Constellation), alimentée à chaque navigation, utilisée par l'autocomplétion et
  la suppression par plage.
- **Barre d'Intention** : suggestions enrichies au fil de la frappe — pages ouvertes,
  favoris, historique et commandes rapides, chacune étiquetée.
- **Extensions** : chargement d'extensions **non empaquetées** (mode développeur, comme
  tous les navigateurs Chromium) via `session.extensions.loadExtension`, persistées et
  rechargées par profil. Chrome Web Store ne permettant pas l'installation directe
  depuis un navigateur tiers, un lien externe permet de le parcourir pour récupérer le
  code source à charger.
- **Téléchargements** : suivi complet (table dédiée, progression en direct), bouton
  avec pastille d'activité dans la barre de titre, panneau détaillé (ouvrir le fichier,
  afficher dans le dossier, annuler, effacer l'historique).
- **Navigation privée** : profil éphémère à session **en mémoire** (aucune trace au-delà
  de la fermeture), aucun historique journalisé, badge « privé » — via `Ctrl+Maj+N` ou
  le sélecteur de profil.
- Favoris : étoile dans l'en-tête de chaque page (mode Focus) pour épingler/désépingler.

## [0.3.0] — 2026-07-09

### Ajouté

- **Paramètres complets façon Chrome / Edge / Brave** — 13 sections :
  Intelligence, Profils, Apparence, Navigation, Recherche, Confidentialité & sécurité,
  Performance, Langues, Système, Données, Labo (flags), Réinitialiser, À propos.
- **Apparence** : couleur d'accent (Glacier, Lavande, Émeraude, Ambre, Rose) appliquée en direct ;
  zoom des pages par défaut.
- **Confidentialité & sécurité** : autorisations des sites (caméra/micro, localisation, notifications),
  en-tête **Do Not Track**, **Toujours HTTPS** (mise à niveau http→https des navigations).
- **Performance** : économiseur de mémoire réglable (2–12 pages actives).
- **Langues** : correcteur orthographique activable.
- **Système** : bouton *Navigateur par défaut* (ouvre les réglages Windows), mode **proxy**
  (système / direct / personnalisé).
- **Réinitialiser** : remise à zéro des préférences (profils, pages et clés API préservés).
- **Recherche** : ajout de Bing, Ecosia et Startpage.
- **Annuaire des URLs `chrome://`** dans À propos (équivalent de `chrome://chrome-urls`) —
  routage étendu : `chrome://settings[/sous-page]`, `chrome://flags`, `chrome://version`,
  `chrome://about`, `chrome://downloads`, `chrome://password-manager`… + diagnostics moteur.
- **À propos** enrichi : versions ÆTHER / Electron / Chromium / Node / V8.
- **Icône d'application** générée depuis le logo (Æ serif sur carré bleu nuit) — fenêtre + exe +
  installeur. Script `npm run gen:icon`.
- Versionnage + `CHANGELOG.md` tenus à jour à chaque évolution.

## [0.2.0] — 2026-07-08

### Ajouté

- **Guide** réouvrable (`F1` ou bouton « ? ») + **repères d'accueil** pointant les zones réelles
  après l'onboarding.
- **Libellés** sur la bascule Focus/Toile, états vides actionnables, légende de la Constellation.
- **Profils** multiples (avatar dans la barre de titre) : sessions isolées (cookies/connexions
  séparés), espaces de travail cloisonnés. Schéma SQLite migré sans perte de données.
- **Labo (flags)** — façade `chrome://flags` branchée sur de vrais switches Chromium.
- **Pages internes** du moteur débloquées (`chrome://gpu`, `media-internals`…) + page d'erreur
  dédiée expliquant Chromium ≠ Chrome.
- Réglages **Navigation** (accueil, zoom, permissions, téléchargements) et **Données**
  (effacer les données de navigation).
- Relais des raccourcis globaux (dont `F1`) même quand une page web a le focus.

## [0.1.0] — 2026-07-08

### Ajouté

- MVP : fenêtre frameless, Barre d'Intention (classification heuristique + IA), mode Focus
  (vue scindée), Toile spatiale (cartes + aperçus), Constellation, panneau Muse (IA hybride
  Ollama + Claude/OpenAI/xAI), persistance SQLite + premiers embeddings, onboarding.
