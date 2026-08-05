# Journal des modifications — ÆTHER

Toutes les évolutions notables du projet. Le versionnage suit [SemVer](https://semver.org/lang/fr/) :
`MAJEUR.MINEUR.CORRECTIF`. Tant qu'ÆTHER est en `0.x`, chaque lot de fonctionnalités
incrémente le **mineur**, chaque correctif isolé le **correctif**.

## [0.94.0] — 2026-08-03

### Corrigé

- **La barre d'adresse s'ouvrait vide** quand on cliquait sur la pilule d'intention centrale, quelle
  que soit la page (pas seulement les pages internes `aether://`/`chrome://`, où c'était le plus
  gênant) — l'URL de la page active ne lui était jamais transmise, contrairement à un bouton
  équivalent ailleurs dans l'appli qui le faisait déjà correctement.
- **Les DevTools (F12/Inspecter) s'ouvrent maintenant dans une vraie fenêtre Windows séparée**, comme
  dans Chrome — cadre natif, croix de fermeture, et le menu propre des DevTools (« ⋮ › Dock side »)
  redevient fonctionnel pour choisir la position (droite/bas/gauche/détaché). Avant, les DevTools
  étaient ancrées à la main dans la fenêtre ÆTHER elle-même : ce montage empêchait le menu natif de
  fonctionner (il a besoin d'une vraie fenêtre à lui pour se redimensionner) et ne laissait aucun
  bouton visible pour fermer le panneau. Le réglage Réglages › Système dédié à la position disparaît
  en conséquence — il ne sert plus à rien, ce choix se fait désormais directement dans les DevTools.
- **Bulle « Traduire » : plusieurs défauts visuels.** Le texte « Toujours traduire les pages
  rédigées en… » prenait la couleur d'accent choisie dans Réglages (rose pour l'accent du même nom)
  au lieu d'une couleur de texte neutre comme le reste de la bulle ; la case à cocher est remplacée
  par l'interrupteur (Toggle) déjà utilisé partout ailleurs dans ÆTHER.
- **Logos noircis après traduction sur certains sites (ex. cia.gov)** : le texte à l'intérieur d'un
  `<svg>` (souvent un sceau/logo avec du texte décoratif gravé dedans) était traité comme du texte de
  page ordinaire et retraduit — modifier ces nœuds altérait visuellement le rendu du logo. Ce texte
  est désormais exclu de la traduction (il n'y a de toute façon jamais de sens à le traduire).

### À propos (pas un bug, comportement volontaire)

- **Revenir à la langue d'origine recharge la page**, contrairement à traduire qui ne recharge
  jamais : une version antérieure restaurait le DOM sans recharger, mais un site qui se re-rend
  par-dessus (SPA React/Vue) rendait alors « Afficher l'original » inopérant — le rechargement complet
  est le compromis retenu pour que ce bouton marche de façon fiable partout, au prix d'être un peu
  plus lent/visible que la traduction elle-même.

## [0.93.2] — 2026-08-03

### Corrigé

- **L'erreur d'un appel YouTube/Gmail affichait « clé API refusée », un message trompeur qui
  masquait la vraie raison.** Ces appels réutilisaient `ensureOk`, pensé pour les clés API IA
  (Anthropic/OpenAI/xAI), où un 401/403 ne peut avoir qu'un seul sens. Pour Google, un 403 peut
  vouloir dire plusieurs choses très différentes (API non activée dans Google Cloud Console, scope
  manquant côté consentement, quota dépassé…) — le détail renvoyé par Google est désormais inclus
  dans le message d'erreur affiché, pour pouvoir identifier la vraie cause sans deviner.

## [0.93.1] — 2026-08-03

### Corrigé

- **Le bouton « Se connecter avec Google » restait affiché après une connexion réussie**, sans
  jamais montrer le badge « connecté » ni les boutons vers les abonnements YouTube/l'aperçu Gmail —
  jusqu'au prochain redémarrage complet d'ÆTHER. Cause : le badge dépendait de deux sources d'état
  combinées par un `&&`, dont l'une (`AppSettings.hasGoogleAccount`) est un instantané persisté qui
  ne se rafraîchit que via un patch de réglages classique — jamais mis à jour par le flux de
  connexion lui-même. L'autre source (`googleStatus`, mise à jour en direct par `connect()`) suffit
  à elle seule ; le badge s'appuie désormais uniquement sur elle.

## [0.93.0] — 2026-08-03

### Ajouté

- **Section Réglages pour le client OAuth Google, avec les instructions pour l'obtenir.** La 0.92.0
  exigeait de poser `AETHER_GOOGLE_CLIENT_ID`/`_SECRET` dans un fichier `.env.local` à la main. Un
  nouveau bloc « Client OAuth Google » (Réglages › Intelligence, juste au-dessus du bloc de
  connexion) permet de les saisir directement dans l'interface, avec les cinq étapes pour les
  obtenir sur Google Cloud Console (activer les API, créer un client type « Desktop app ») et un
  bouton qui ouvre la console directement. Le bouton « Se connecter avec Google » reste désactivé
  tant que ce client n'est pas configuré, avec un message explicite. Chiffré au repos comme le
  reste des secrets.

## [0.92.0] — 2026-08-03

### Ajouté

- **Connexion à un compte Google — OAuth natif (RFC 8252), pas une session web.** Après l'échec
  définitif de la connexion Google *dans une page web* (contournement User-Agent/WebAuthn/timing,
  épuisé et confirmé insuffisant par Google et Microsoft eux-mêmes, versions 0.82.0 à 0.91.0), ÆTHER
  propose désormais une voie différente et légitime : un bouton « Se connecter avec Google » dans
  Réglages › Intelligence ouvre le vrai navigateur système pour l'écran de consentement officiel
  Google, récupère un jeton via un petit serveur local (jamais de webview interne — c'est
  précisément ce qui permet d'éviter le blocage anti-navigateur-intégré), puis appelle les API
  Google en votre nom. **Important : ceci ne connecte PAS youtube.com/gmail.com dans le
  navigateur** — pour ça, le bouton « Ouvrir dans le navigateur par défaut » reste la seule voie.
  Une fois connecté : consultation des abonnements YouTube + activité récente des chaînes suivies
  (l'API publique n'expose pas l'historique de visionnage réel, seulement ça), et un aperçu en
  lecture seule de la boîte Gmail. Jetons chiffrés au repos (comme le reste des secrets),
  jamais transmis au renderer, PKCE + vérification `state` systématiques, usage strictement
  personnel (aucune donnée ne quitte votre machine vers un tiers autre que Google).

## [0.91.0] — 2026-08-02

### Corrigé

- **L'invite Windows Hello persistait malgré la 0.90.1, précisément lors d'un clic sur « Se
  connecter » depuis YouTube.** Cause trouvée par relecture ciblée : ce clic redirige vers
  `accounts.google.com` par une redirection **serveur** (302), pas par un lien HTML classique — un
  chemin distinct (`will-redirect`) qui ne posait jamais le correctif avant que la page Google ne
  s'exécute, exactement le même bug déjà corrigé pour les liens cliqués (`will-navigate`, 0.90.1)
  mais resté ouvert pour ce quatrième point d'entrée. Corrigé avec la même logique, adaptée à la
  sémantique propre de cet évènement.

## [0.90.1] — 2026-08-02

### Corrigé

- **L'invite Windows Hello persistait malgré la 0.90.0.** Cause confirmée par relecture : la
  commande CDP qui enregistre le correctif est asynchrone (un aller-retour), mais rien n'empêchait
  le VRAI chargement de la page de démarrer avant que cet enregistrement ne soit confirmé — une
  fenêtre de course qui pouvait expliquer que l'invite reste malgré l'injection CDP. Le chargement
  de `accounts.google.com` (page principale, popup de connexion, et navigations suivantes à
  l'intérieur de cette popup) attend désormais explicitement cette confirmation avant de partir.
  Limite structurelle restante, propre à l'API d'Electron : le tout premier chargement d'une popup
  de connexion est déclenché par Electron lui-même dès qu'elle s'ouvre, avant que ce correctif ne
  puisse intervenir — non couvrable par ce mécanisme.

## [0.90.0] — 2026-08-02

### Corrigé

- **L'invite Windows Hello sur la page de connexion Google persistait malgré la 0.89.0.** Cause :
  le correctif s'injectait au `dom-ready`, en pariant que ce défi n'étant déclenché que par une
  interaction (saisir l'e-mail puis valider), l'injection aurait largement le temps de s'exécuter
  avant — pari faux en pratique, la page pouvant capturer sa propre référence à
  `navigator.credentials.get` dans un script exécuté avant même `dom-ready`. Injection refaite via
  CDP (`Page.addScriptToEvaluateOnNewDocument`), la même technique déjà utilisée pour le crochet du
  Chrome Web Store — s'exécute avant le tout premier script de la page, quelle que soit sa façon de
  capturer la référence.

## [0.89.0] — 2026-08-02

### Corrigé

- **Une invite Windows native (« Choisir une clé d'accès ») s'ouvrait systématiquement juste après
  avoir saisi son adresse e-mail sur la page de connexion Google**, bloquant le clavier de toute la
  fenêtre ÆTHER — Google tente un défi WebAuthn/passkey en plus du mot de passe, vraisemblablement
  une vérification renforcée liée à la détection déjà documentée du moteur embarqué. Neutralisé
  spécifiquement sur `accounts.google.com` (jamais ailleurs, pour ne pas casser un passkey légitime
  sur un autre site) : Google retombe désormais sur la saisie du mot de passe normale.

## [0.88.1] — 2026-08-02

### Corrigé

- **Le bouton « Ouvrir dans le navigateur par défaut » de la bannière Google (0.88.0) menait à une
  erreur « 400 » de Google.** Cause : l'URL transmise était celle de la page de refus elle-même,
  qui porte des jetons liés à la requête précise qui a échoué — invalides une fois rouverts
  ailleurs. La bannière ouvre désormais le point d'entrée générique de connexion Google
  (`accounts.google.com`), toujours valide.

## [0.88.0] — 2026-08-02

### Ajouté

- **Bascule automatique vers le navigateur par défaut quand Google refuse la connexion.** Recherche
  approfondie (4 agents, sources citées dans le commit) : le blocage « Ce navigateur ou cette
  application ne sont peut-être pas sécurisés » ne repose pas que sur le User-Agent — Google
  documente lui-même des vérifications supplémentaires (conformité aux standards web, en-têtes
  internes que seul le vrai Chrome peut produire), confirmées par des rapports de janvier 2026
  montrant que même des webviews natives du système (pas seulement Electron) s'y heurtent encore.
  Aucun réglage de User-Agent ne peut donc garantir ce blocage déjoué à coup sûr. ÆTHER détecte
  désormais la page de refus explicite de Google (chemin dédié `signin/rejected`, ou
  `error=disallowed_useragent`) et propose une bannière pour ouvrir la page dans le navigateur par
  défaut du système — le seul contournement fiable à 100 %, au prix de terminer la connexion hors
  d'ÆTHER.

## [0.87.0] — 2026-08-02

### Corrigé

- **La connexion à un compte Google restait bloquée malgré les correctifs des 0.82.0/0.83.1.**
  Ceux-ci corrigeaient un vrai bug (la relation technique dont ces connexions dépendent), mais la
  cause du blocage lui-même est différente et plus profonde : Google refuse, depuis juillet 2023,
  toute connexion à un compte Google depuis un moteur Chromium **embarqué** (politique délibérée et
  documentée, qui vise Electron par nature — Brave/Edge/Vivaldi/Arc y échappent parce qu'ils SONT
  eux-mêmes de vrais navigateurs autonomes, pas parce qu'ils déguisent quoi que ce soit). Après
  recherche (qutebrowser, un navigateur indépendant confronté au même blocage pour la même raison,
  documente ce contournement depuis des années), `accounts.google.com` reçoit désormais un
  User-Agent Edge dédié — rien que pour ce site précis, jamais pour le reste de la navigation. Ce
  n'est pas garanti définitif : Google ajuste sa détection de temps en temps (déjà arrivé par le
  passé à d'autres navigateurs indépendants), un futur ajustement pourra être nécessaire.

## [0.86.0] — 2026-08-02

### Corrigé

- **Installer la même extension depuis le Store sur deux profils différents pouvait casser
  l'instance déjà en cours d'exécution sur le premier profil.** Le dossier d'extraction n'était
  indexé QUE par l'identifiant de l'extension, jamais par profil — deux profils censés être
  totalement cloisonnés finissaient par partager (et se marcher dessus) les mêmes fichiers sur
  disque. Chaque profil a désormais son propre dossier.
- **Retirer une extension du Store ne libérait jamais l'espace disque qu'elle occupait** — la ligne
  disparaissait des réglages, mais ses fichiers restaient indéfiniment sur le disque. Corrigé aussi
  bien pour un retrait explicite que pour un profil (notamment de navigation privée) qui disparaît :
  une extension installée pendant une session privée ne laisse plus son code source derrière elle.
- **Une icône d'extension fabriquée dans un manifeste pouvait pointer hors du dossier de
  l'extension** — même famille de traversée de chemin que celle déjà corrigée pour les avatars de
  profil, appliquée ici aussi.

## [0.85.1] — 2026-08-02

### Corrigé

- **Supprimer un espace pouvait ramener de force sur un autre espace que celui choisi entre-temps.**
  `removeSpace` décidait s'il fallait basculer d'espace en relisant un instantané de l'état capturé
  AVANT l'appel réseau vers le processus principal — cliquer sur un autre espace pendant cette brève
  fenêtre pouvait donc être écrasé au retour de l'appel, ramenant vers un espace non choisi. La
  décision se base désormais sur l'état réel au moment où elle est prise.

## [0.85.0] — 2026-08-02

### Corrigé

- **Muse (l'assistant IA) n'avait aucune consigne pour distinguer le texte d'une page web du reste
  de ses instructions.** Le contenu d'une page (activé via « inclure le contexte de la page »)
  était injecté tel quel dans le prompt envoyé au modèle, sans délimiteur ni consigne — une page
  contenant un texte formulé comme une instruction (même invisible) aurait pu tenter de détourner
  ses réponses. Le contenu de page est désormais clairement délimité et explicitement signalé comme
  une donnée non fiable à ne jamais traiter comme une instruction.
- **Un message pouvait consommer deux fois le plafond quotidien d'appels IA cloud** si le premier
  fournisseur configuré échouait avant tout token (coupure réseau transitoire) et que la bascule se
  faisait vers un second fournisseur cloud — chacun décomptait indépendamment le même plafond pour
  un seul message envoyé. Compté une seule fois par message désormais.

## [0.84.0] — 2026-08-02

### Corrigé

- **Supprimer un profil ne supprimait pas ses autorisations par site ni son historique de
  recherche.** Toutes les autres données du profil (espaces, pages, favoris, téléchargements,
  extensions) disparaissaient bien en le supprimant — ces deux tables avaient été oubliées et
  restaient orphelines en base pour de bon. Plus gênant pour l'historique de recherche : il contient
  le texte littéral des recherches, potentiellement sensible, qui aurait dû disparaître avec le
  profil comme le reste. Les deux sont désormais bien effacées.

## [0.83.1] — 2026-08-02

### Corrigé

- **La connexion à un compte Google restait bloquée malgré le correctif de la 0.82.0.** Cause :
  cette première correction ne couvrait que les popups demandant explicitement une taille de
  fenêtre (`disposition === 'new-window'`) — or un `window.open(url)` SANS dimensions explicites,
  ce qu'utilise une partie du flux de connexion Google, est classé exactement comme un simple lien
  `target="_blank"` par Chromium, alors que la relation `window.opener` dont ce flux dépend reste
  posée dans les deux cas. Un vrai popup natif préservant cette relation est désormais autorisé
  spécifiquement vers `accounts.google.com`, quel que soit ce classement.

## [0.83.0] — 2026-08-01

### Corrigé

- **Bloquer le son d'un site (Réglages › Autorisations par site) n'avait jusqu'ici AUCUN effet
  réel.** Le réglage s'enregistrait bien et la case restait cochée, mais rien ne le relisait jamais
  au chargement d'une page — seul le bouton « Muet » manuel par onglet coupait vraiment le son. Un
  site réglé sur Son → Bloquer coupe désormais bien le son, dès le chargement et à chaque nouvelle
  navigation ; le rétablissement manuel via le bouton « Muet » reste toujours prioritaire.
- **Un onglet ayant téléchargé un fichier puis fermé sans navigation ultérieure laissait une entrée
  orpheline** dans le compteur qui distingue un premier téléchargement (toujours autorisé) d'un
  second traité comme automatique — fuite non bornée sur une session longue avec beaucoup d'onglets/
  téléchargements, purgée désormais à la fermeture de l'onglet.

## [0.82.0] — 2026-08-01

### Corrigé

- **Impossible de se connecter à un compte Google (YouTube et ailleurs) : « Ce navigateur ou cette
  application ne sont peut-être pas sécurisés ».** Cause : toute ouverture de fenêtre par un site
  (`window.open`) était systématiquement refusée puis rouverte comme un nouvel onglet ÆTHER
  totalement indépendant — y compris les VRAIS popups (taille fixe demandée explicitement), le motif
  qu'utilisent la quasi-totalité des connexions OAuth (Google, Microsoft, GitHub…). Cela cassait la
  relation `window.opener`/`postMessage` dont ces flux dépendent pour renvoyer le jeton de connexion
  à la page d'origine, un motif que Google détecte et bloque explicitement (il ressemble à un
  webview embarqué tentant de voler des identifiants). Un vrai popup natif est désormais autorisé
  dans ce cas précis, sans rien changer pour un lien ouvert normalement dans un nouvel onglet.

## [0.81.0] — 2026-08-01

### Corrigé

- **Chaque fenêtre de navigation privée ouverte puis fermée laissait sa session (cookies, cache,
  autorisations, certificats observés) vivre indéfiniment en mémoire jusqu'à la fermeture complète
  de l'appli.** Cause : chaque fenêtre privée reçoit une partition en mémoire à usage unique, jamais
  réutilisée — rien ne la libérait donc jamais quand son profil disparaissait (fermeture de la
  fenêtre, ou changement de profil dans la même fenêtre). Une session longue avec de nombreuses
  fenêtres privées ouvertes au fil du temps accumulait ainsi silencieusement autant de sessions
  orphelines que de fenêtres — contraire à l'attente d'une navigation privée censée ne rien laisser
  derrière elle une fois fermée. La partition et le cache de certificats associés sont désormais
  explicitement vidés dès que le dernier usage d'un profil privé se termine.

## [0.80.2] — 2026-08-01

### Corrigé

- **`reg.exe` était invoqué par son simple nom, résolu par recherche dans le PATH** (répertoire
  courant compris) plutôt que par son chemin absolu — durcissement en défense en profondeur contre
  un binaire malveillant placé plus tôt dans un dossier du PATH accessible en écriture. Sans
  élévation de privilège possible dans ce cas précis, mais corrigé par prudence : les deux appels
  (candidature navigateur par défaut, lecture du choix de l'utilisateur) ciblent désormais
  explicitement `%SystemRoot%\System32\reg.exe`.

## [0.80.1] — 2026-08-01

### Corrigé

- **Un nom de fichier fabriqué pouvait faire supprimer n'importe quel fichier du disque portant
  une extension image.** Le correctif de la 0.80.0 ne portait que sur la LECTURE
  (`avatarImageDataUrl`) ; la même validation manquait à la SUPPRESSION (`deleteAvatarImage`,
  utilisée en interne par les changements/suppressions de profil), plus grave puisque destructive
  et irréversible. Corrigé avec le même contrôle de format.

## [0.80.0] — 2026-08-01

### Corrigé

- **Un nom de fichier fabriqué (`../../../ailleurs/photo.png`) pouvait faire relire n'importe quel
  fichier du disque portant une extension image.** `avatarImageDataUrl` (utilisée pour l'avatar de
  profil et le fond d'écran du nouvel onglet) ne vérifiait que l'extension du nom reçu par IPC avant
  de le joindre au dossier des avatars — une traversée de chemin en ressortait, contrairement au
  protocole `aether://avatars/…` qui, lui, impose déjà le bon format (UUID). Le même contrôle
  s'applique désormais ici.
- **Désactiver une extension juste après l'avoir déjà désactivée (ou pendant qu'une autre fenêtre le
  faisait) pouvait planter toute l'application.** Cause : la même famille de bug que la 0.79.0 — un
  appel pouvant lever de façon synchrone n'était pas protégé à cet endroit précis, alors qu'il
  l'était déjà pour le cas équivalent ailleurs dans le même fichier.

## [0.79.0] — 2026-08-01

### Corrigé

- **Une simple erreur d'enregistrement (clé USB éjectée, disque plein, permission refusée) pouvait
  planter TOUTE l'application, toutes fenêtres confondues.** Cause : `savePage`/`captureScreenshot`
  (« Enregistrer sous… », capture d'écran) n'entouraient pas leurs opérations d'un `try/catch`, et
  leur appelant IPC ne rattrapait pas non plus le rejet — sur Node, un rejet de promesse non
  intercepté équivaut à une exception fatale pour tout le process. Ces deux méthodes affichent
  désormais un message d'erreur clair au lieu de faire tomber l'appli. Le même filet de sécurité
  manquait à trois autres endroits repérés au passage (téléchargement d'une mise à jour coupé par
  le réseau, écriture d'un embedding échouant sur une erreur SQLite, bulle d'une extension tierce
  au chemin cassé) : tous corrigés selon le même principe.

## [0.78.0] — 2026-08-01

### Corrigé

- **Un second clic droit refermait la bulle en cours au lieu d'en ouvrir une nouvelle.** Cause :
  la fenêtre popup, plus grande que la carte visible et non focusable (donc jamais « activée » par
  un clic), captait quand même TOUT clic tombant dans ses bornes — y compris un second clic droit
  destiné à la page en dessous, qui ne recevait alors jamais son propre évènement, et la bulle se
  refermait simplement (clic hors carte) sans qu'aucune nouvelle ne s'ouvre à sa place. Le popup
  transmet désormais les clics à ce qu'il y a en dessous dès que le curseur n'est plus sur sa
  carte, pour qu'un second clic droit ailleurs atteigne réellement la page.
- **Le fond des bulles clignotait (fond sombre puis clair) à l'ouverture.** La capture qui sert de
  source au flou arrive toujours un peu après que la carte soit déjà affichée (son fond opaque de
  repli) — elle remplaçait alors ce fond d'un coup, sans transition, ce qui pouvait sauter aux
  yeux si la page derrière était nettement plus claire. Le calque flouté apparaît désormais en
  fondu (160ms) plutôt que d'un coup.
- **Changer le thème dans Réglages ne se répercutait pas sur le menu contextuel et certaines
  autres bulles avant de redémarrer l'appli.** Ces fenêtres ont leur propre contexte JS, sans
  store partagé avec la fenêtre principale — elles ne relisaient les réglages qu'une fois, à leur
  tout premier affichage, jamais revisité ensuite (une fenêtre popup n'est jamais détruite entre
  deux usages, donc jamais remontée). Un changement de réglages est désormais diffusé à ces
  fenêtres, qui réappliquent le thème immédiatement.

### Note

- **Fermer/minimiser l'appli** — ce réglage existe déjà et fonctionne : Réglages › Système ›
  « Minimiser au lieu de quitter ». Rien à ajouter, juste à l'activer si souhaité.

## [0.77.1] — 2026-08-01

### Corrigé

- **L'animation du menu principal (les 3 petits points) était redevenue saccadée.** Cause : la
  capture d'écran source du flou (ajoutée en 0.76.1) s'exécutait à CHAQUE redimensionnement,
  y compris l'appel immédiat volontaire de chaque rafale (ouvrir/fermer un sous-menu enchaîne
  plusieurs redimensionnements par seconde) — une vraie prise d'écran a un coût GPU réel, assez
  pour saccader une animation qui en déclenche autant. La capture a son propre anti-rebond
  maintenant, découplé de celui des bornes : elle n'attrape que l'état final, une fois la rafale
  calmée, jamais pendant.
- **Le retournement du menu contextuel ne se déclenchait pas toujours** — un clic dont
  l'ESTIMATION initiale (avant mesure réelle) semblait tenir à l'écran, mais dont le menu
  RÉELLEMENT mesuré dépassait finalement (liste plus longue que prévu), gardait la décision prise
  sur cette estimation : le menu débordait bel et bien, puis se faisait recaler en bloc contre le
  bord de l'écran, déconnecté du clic. Le retournement se recalcule désormais sur la taille
  RÉELLE à chaque mesure, pas seulement sur l'estimation de départ. Vérifié par test : un clic où
  l'estimation dit « pas de place » mais la vraie taille, plus petite, tient très bien.

## [0.77.0] — 2026-08-01

### Corrigé

- **La vraie cause du décalage des bulles, trouvée.** Chaque popover natif ajoute 8px de marge
  invisible à sa taille réellement mesurée (anti-rognage sur un facteur d'échelle Windows non
  entier) — pour une bulle ancrée par son bord DROIT (menu principal, infos de site, traduction,
  extensions…), cette marge était comptée AVANT le bouton plutôt qu'après : la carte visible,
  plus étroite que la fenêtre qui l'héberge, se retrouvait décalée de ces 8px par rapport au
  bouton. Corrigé : l'ancrage se calcule désormais sur la taille RÉELLE de la carte, jamais sur
  la fenêtre. L'hypothèse de la 0.76.0 (bordure Windows invisible, `getContentBounds()`) n'était
  vraisemblablement pas la bonne piste ; conservée malgré tout, elle reste correcte en principe.
- **Le placement du menu contextuel (clic droit) ne se retournait jamais** — la bulle partait
  toujours du coin haut-gauche du clic, quitte à déborder de l'écran puis se faire recaler en
  bloc contre son bord, complètement déconnectée du point cliqué (« aimantée »). Il se retourne
  désormais horizontalement et verticalement, indépendamment, selon la place réellement
  disponible : le coin de la bulle qui reste sous la souris s'adapte à la position du clic,
  jamais un bord de fenêtre qui reste collé à l'écran pendant que la bulle dérive.
- **L'espace entre une bulle classique et son bouton était trop large** — réduit au minimum
  (bulle collée sous son bouton, comme demandé).

## [0.76.1] — 2026-08-01

### Corrigé

- **Le sous-menu de langues de la bulle de traduction restait tronqué avec un défilement
  interne** — malgré le correctif précédent (sortie de la carte). Cause : un plafond de hauteur
  (`max-h-64 overflow-y-auto`) forçait un défilement même une fois la boîte englobante agrandie
  pour le contenir. Retiré — le sous-menu s'affiche désormais en entier, sans scroll.
- **Le flou des bulles ne se voyait quasiment jamais** (juste la teinte de la 0.76.0, sans le
  flou promis). Cause probable trouvée : la capture d'écran source du flou était REJETÉE EN BLOC
  dès que le popup débordait, même de quelques pixels, de la fenêtre principale — un cas en
  réalité systématique (chaque popup a 8px de marge invisible intégrée) qui laissait la plupart
  des bulles sans la moindre capture, silencieusement. La capture est désormais RECADRÉE au lieu
  d'être rejetée : elle part dès qu'il reste ne serait-ce qu'un pixel de recouvrement avec la
  fenêtre principale, ce qui couvre la quasi-totalité des cas réels.

### Connu

- **L'alignement des bulles reste imparfait.** Le correctif de la 0.76.0 (`getContentBounds()`)
  visait une bordure de redimensionnement Windows invisible qui aurait faussé le calcul — cette
  hypothèse n'a probablement pas identifié la vraie cause, le décalage persistant à l'identique.
  Recherche en cours ; un signalement précis (capture rapprochée bouton + bulle, et le
  pourcentage d'affichage Windows utilisé — Réglages Windows › Affichage › Mise à l'échelle)
  aiderait à trouver la cause exacte plutôt que deviner à nouveau à l'aveugle.

## [0.76.0] — 2026-08-01

### Corrigé

- **Le sous-menu « Choisir une autre langue » de la bulle de traduction se faisait rogner par le
  bas** — sa liste de 16 langues (jusqu'à 256px) dépassait la hauteur de la carte, coupée net par
  le `overflow: hidden` nécessaire au flou. Le sous-menu est désormais un frère de la carte (pas
  son enfant), et la boîte englobante grandit vers le bas pour le contenir entièrement — même
  principe déjà utilisé pour le sous-menu du menu principal.
- **Chaque bulle apparaissait légèrement décalée par rapport à son bouton.** Cause unique et
  systématique : la fenêtre principale est frameless mais redimensionnable, ce qui lui laisse le
  style Windows par défaut `WS_THICKFRAME` — une bordure de redimensionnement invisible que
  `getBounds()` inclut dans ses coordonnées, contrairement à `getContentBounds()`. Tout calcul de
  position de bulle partait donc d'une origine décalée de cette bordure. Corrigé à chacun des sept
  points de conversion ancrage → écran (menu principal, infos de site, aperçu d'onglet, traduction,
  favoris, extensions, menu contextuel, confirmation d'installation, invite de permission).
- **Les libellés du menu principal et du menu contextuel se terminaient par « … »** — des menus à
  liste FIXE (jamais du contenu utilisateur arbitraire) n'ont aucune raison d'être jamais coupés.
  Les bulles s'élargissent désormais pour toujours afficher l'option en entier.

### Ajouté

- **Clic droit sur une page web : Enregistrer sous…, Imprimer…, et Traduire en français** (la
  langue de l'interface) — trois actions qui manquaient par rapport à un navigateur classique,
  toutes trois déjà disponibles ailleurs dans l'appli (menu principal, bouton dédié de la barre
  d'adresse) et simplement reliées ici.
- **Bulles légèrement teintées de la couleur d'accent du thème choisi** (Réglages › Apparence),
  au lieu d'un gris neutre fixe — même dosage discret (9%) partout : popups natifs, panneaux
  pleine fenêtre, menu Téléchargements, bannière navigateur par défaut.

## [0.75.0] — 2026-07-31

### Ajouté

- **Vrai flou dans les bulles de l'appli (menu principal, infos de site, aperçu d'onglet, menu
  contextuel, dossier de favoris, traduction, extensions, mise à jour prête, installation
  d'extension, invite de permission), sans le risque de débordement de la v0.74.0.** Ces bulles
  sont des fenêtres Windows séparées et transparentes ; ni un flou CSS classique (rien à flouter
  dans leur propre page) ni le matériau natif Windows « Acrylic » (peint sur tout le rectangle de
  la fenêtre, débordait de la carte) ne fonctionnaient de façon fiable. Le main capture désormais
  une photo de ce qu'il y a RÉELLEMENT derrière chaque bulle à sa position exacte, et chaque carte
  l'affiche elle-même, floutée, comme un calque enfant strictement DÉCOUPÉ par son propre
  `overflow: hidden` — un enfant ne peut pas peindre en dehors de la boîte que son parent lui
  refuse, contrairement aux deux mécanismes écartés. Vérifié pour les DEUX cartes qui peuvent
  coexister dans le menu principal (menu + sous-menu ouvert), pas seulement la première trouvée.
  Les deux bulles qui sont de vrais éléments de la fenêtre principale (menu Téléchargements,
  bannière navigateur par défaut) gardaient déjà un flou réel depuis la 0.74.1, inchangé. Les
  panneaux pleine fenêtre (Réglages, Téléchargements, Favoris, Historique…) étaient déjà
  correctement floutés de longue date — ce ne sont pas des fenêtres séparées.

## [0.74.1] — 2026-07-31

### Corrigé

- **Le flou natif ajouté en 0.74.0 débordait largement de la bulle** (capture utilisateur : un
  gros bloc flouté visible bien au-delà du menu). Cause : les fenêtres popup sont volontairement
  un peu plus grandes que la carte visible (marge anti-rognage, largeur réservée pour un
  sous-menu pas encore ouvert dans le menu principal) — le matériau Windows natif peint sur TOUT
  le rectangle de la fenêtre, sans se soucier de ces zones rendues invisibles côté CSS. Retiré :
  ces bulles (menu principal, infos de site, aperçu d'onglet…) reviennent à une carte opaque sans
  flou, seul rendu qui garantit de ne jamais déborder. Les deux bulles qui sont de vrais éléments
  de la fenêtre principale (menu Téléchargements, bannière navigateur par défaut) gardent
  elles un flou réel — sans ce risque, car strictement contenues dans leur propre boîte.
  Un flou réellement contenu pour les popups natifs demanderait une implémentation plus lourde
  (capture d'écran de la zone concernée) — hors scope de ce correctif.

## [0.74.0] — 2026-07-31

### Corrigé

- **Le bouton « Définir par défaut » ouvrait la liste générale des applications par défaut de
  Windows au lieu de la fiche d'ÆTHER elle-même** — l'utilisateur devait ensuite chercher ÆTHER
  lui-même dans la liste. Utilise désormais le même paramètre `registeredAppUser` que
  Chrome/Brave/Edge pour s'ouvrir directement sur la fiche d'ÆTHER, un clic pour tout définir.
- **Types de fichiers manquants pour la candidature navigateur par défaut** — seuls .htm/.html/
  .shtml étaient déclarés. Ajout de .mhtml, .mht, .pdf, .svg, .webp, .xht, .xhtml, .xml : chacun
  obtient désormais son propre bouton « Définir ÆTHER par défaut » dans la fiche Windows, .pdf
  compris, comme un navigateur complet.
- **Les bulles de l'appli (menu principal, infos de site, aperçu d'onglet…) n'étaient pas
  vraiment floutées** — juste un fond très opaque avec un soupçon de transparence. Cause : ce
  sont des fenêtres Windows séparées et transparentes (pas des éléments de la page), pour
  composer par-dessus une page vivante sans jamais la rogner ; un flou CSS n'a donc rigoureusement
  rien à flouter dans leur propre page (rien n'y est peint derrière la carte). Posé côté Windows
  lui-même (matériau Acrylic du compositeur DWM, `backgroundMaterial` d'Electron) plutôt que côté
  CSS, avec un fond de carte éclairci pour laisser ce flou transparaître — respecte le canal
  alpha déjà composé, coins arrondis compris. Sans effet avant Windows 11 22H2, sans jamais rien
  casser sur les systèmes plus anciens.

### Harmonisé

- **Le nom de page dans l'en-tête de chaque page (mode Focus) changeait de largeur avec la
  longueur du titre et la taille de la fenêtre** (`26%` de la largeur disponible), décalant
  d'autant la barre d'adresse juste à côté selon le site ou le redimensionnement. Largeur fixe
  désormais : toujours la même taille, quel que soit le titre.

## [0.73.0] — 2026-07-31

### Corrigé

- **Le fond flouté disparaissait entièrement dès qu'on activait le flou** — régression du
  correctif précédent. `position: absolute` seul ne crée PAS de contexte d'empilement CSS ; le
  z-index négatif ajouté en 0.72.0 pour repasser le calque flouté sous le texte s'échappait donc
  vers le contexte d'empilement de l'ancêtre le plus proche qui en établit un (un parent de la
  page nouvel onglet), où il se retrouvait derrière le fond opaque de CET ancêtre plutôt que
  simplement derrière le texte de la page — d'où un fond par défaut uni à la place du fond flouté.
  Reproduit et vérifié hors de l'application (bascule du z-index négatif avec/sans isolation,
  test d'ordre de peinture réel) avant correctif : `isolation: isolate` sur la racine de la page
  fait de ce z-index un détail purement local, qui ne peut plus s'échapper.
- **« ÆTHER est votre navigateur par défaut » alors que rien n'avait été confirmé, et ÆTHER
  n'apparaissait même pas dans Windows Paramètres › Applications par défaut.** Les deux bugs
  avaient la même cause : `app.setAsDefaultProtocolClient`, sous Windows, n'écrit que
  `Software\Classes\http\shell\open\command` — le mécanisme pré-Windows 8, que le sélecteur de
  Windows 10/11 ignore totalement pour les navigateurs, et que son propre `isDefaultProtocolClient`
  relisait ensuite pour se donner raison à lui-même (faux positif). ÆTHER écrit désormais la
  structure que Windows lit réellement pour peupler ce sélecteur —
  `Software\Clients\StartMenuInternet\Aether` et sa `Capabilities` (associations d'URL http/https,
  associations de fichiers .htm/.html/.shtml), inscrite sous `Software\RegisteredApplications`,
  exactement comme Chrome, Firefox, Brave et Edge — et le statut « par défaut » se lit désormais
  dans `UserChoice`, le seul repère que l'utilisateur peut écrire via `ms-settings:defaultapps`,
  jamais ÆTHER lui-même. Toujours strictement désactivé pour le build portable.

## [0.72.0] — 2026-07-30

### Corrigé

- **Texte invisible dès que le flou du fond était activé** — un vrai bug d'empilement CSS, sans
  rapport avec les tentatives précédentes sur la lisibilité. Le calque flouté est
  `position: absolute` ; en CSS, un enfant positionné peint TOUJOURS par-dessus les enfants en
  flux normal (barre de recherche, raccourcis, actualités — tous sans position explicite), quel
  que soit l'ordre dans le DOM. Sans flou, il n'existe aucun calque enfant : rien ne masquait le
  texte, d'où le contraste exact du signalement (« dès que je l'active, plus rien ; je le
  désactive, tout réapparaît »). Le même défaut touchait aussi les thèmes animés, sans qu'on
  l'ait encore remarqué. Un z-index négatif fait maintenant redescendre ces calques sous le flux
  normal, explicitement plutôt que par un ordre implicite fragile.

### Ajouté

- **Candidature d'ÆTHER comme navigateur par défaut de Windows.** ÆTHER s'enregistre désormais
  comme candidat http/https à chaque lancement — c'est cet enregistrement qui le fait apparaître
  dans le sélecteur Windows, le signal demandé. Windows n'autorise aucune app à SE désigner
  elle-même par défaut sans confirmation (protection anti-détournement depuis Windows 8) : une
  bannière propose de confirmer, avec les trois issues de Chrome/Edge — « Définir par défaut »
  (ouvre le sélecteur Windows), « Plus tard » (redemande à la prochaine ouverture) et
  « … › Ne plus afficher » (définitif). Un contrôle permanent existe aussi dans Réglages ›
  Navigation pour y revenir après coup. **Jamais activé pour le build portable**, qui promet
  explicitement aucune écriture registre — vérifié par test, y compris l'échec sans la garde.

## [0.71.0] — 2026-07-30

### Corrigé

- **Sur une image importée, ni le voile ni le flou ne s'appliquaient** — l'image s'affichait
  telle quelle et plus AUCUN texte n'était lisible, alors que la valeur calculée était pourtant
  correcte en base (vérifié : 0,74). Le voile vivait dans un `<div>` frère superposé en absolu,
  et rien ne garantissait qu'il couvre effectivement le fond. Fond et voile ne forment désormais
  qu'une seule pile `background-image` : ils ne peuvent plus se désolidariser ni s'empiler dans
  le mauvais ordre.
- **« Autoriser » rogné par un fondu** dans les listes déroulantes de Confidentialité ›
  Autorisations par site — le conteneur de 96 px était trop juste d'un cheveu pour le mot plus
  son chevron, et le fondu de troncature mordait sur la fin du mot alors qu'il n'y avait rien à
  tronquer.

### Ajouté

- **Réglages du fond d'écran** (Apparence › Thème, images personnelles) : le flou est
  désactivable, et l'assombrissement s'ajuste au curseur. Descendre sous la valeur calculée
  reste possible — un avertissement signale simplement que la lisibilité n'est plus garantie.
  Un lien rétablit la valeur automatique.

## [0.70.0] — 2026-07-30

### Corrigé

- **Textes illisibles sur une image importée — le critère lui-même était le mauvais.** Mesure
  faite sur la photo réellement utilisée : le voile calculé (0,63) atteignait bien 4,7 à 5,3:1
  dans CHAQUE zone de la page, donc « conforme » WCAG AA, et le texte restait pourtant illisible.
  La raison : le critère WCAG suppose un fond **uni**. Par-dessus une photo, chaque glyphe
  traverse des bords et des motifs dont le contraste local n'a rien à voir avec la moyenne, et
  des textes de 10 à 12 px n'y survivent pas. Deux changements en réponse :
  - cible relevée au niveau **AAA (7:1)** au lieu de AA — sur cette même photo, le voile passe de
    0,63 à 0,75 et le contraste de 4,6 à 7,2:1 ;
  - **léger flou du fond** (7 px), qui supprime le détail fin au lieu d'essayer d'en compenser le
    contraste — la technique employée par les fonds translucides des systèmes d'exploitation.
    Appliqué à la seule image, jamais au contenu de la page.

  Les images déjà importées sont recalculées automatiquement au démarrage, sans réimport.
- **Agrandissement saccadé des bulles** (cadenas → « La connexion est sécurisée ») — la fenêtre
  native était redimensionnée avec 60 ms de retard sur son contenu, d'où une animation en deux
  temps. Le premier redimensionnement d'une rafale est désormais appliqué immédiatement, les
  suivants restant regroupés comme avant.

## [0.69.0] — 2026-07-30

### Corrigé

- **Textes illisibles sur une image personnelle — la cause profonde.** Les tons secondaires du
  design emploient des opacités partielles (`/50`, `/60`, `/70`). Or un texte semi-transparent se
  mélange à son propre fond : plus le voile assombrit, plus le texte s'assombrit avec lui. À 50 %
  d'opacité, le contraste **plafonne à 3.74:1 même sur du noir pur** — sous le seuil requis, quoi
  qu'on fasse. Aucune force de voile ne pouvait donc corriger le problème, ce qui explique
  l'échec des trois tentatives précédentes. L'opacité est désormais neutralisée sur un thème
  actif : la teinte voulue par le design est conservée, seul l'alpha change, et le calcul de
  contraste redevient valable. Aucun élément de design n'a été modifié.
- **Croix de fermeture décentrée dans les onglets** — icône de 9 px dans une boîte de 14 px, soit
  2,5 px de marge arrondis de façon asymétrique. Passée à 10 px pour des marges entières.
- **Bouton « Réinitialiser l'autorisation » collé** à la zone surlignée de la permission
  au-dessus.
- **Bulle d'informations du site : titre et croix sautaient d'une vue à l'autre.** La racine et
  les sous-vues avaient chacune leur propre en-tête, avec des rembourrages différents. Un
  en-tête et une enveloppe COMMUNS à toutes les vues garantissent une géométrie identique.

### Ajouté

- **Logos des moteurs de recherche** dans Réglages › Recherche — le favicon servi par le domaine
  du moteur lui-même, sans passer par un service tiers, avec repli sur la pastille lettrée hors
  ligne.
- **Ajouter un moteur sans écrire de gabarit** : il suffit de coller l'adresse d'une recherche
  réelle, la requête y est repérée toute seule. Les gabarits `%s` et la syntaxe OpenSearch
  `{searchTerms}` (Chrome/Firefox) restent acceptés.
- **Page « Drapeaux du moteur »**, destination de `chrome://flags` — tous les drapeaux
  rassemblés au même endroit, comme le fait cette page dans Chrome. Auparavant, `chrome://flags`
  renvoyait vers Performance, où l'on n'en retrouvait qu'une partie, mêlée à d'autres réglages.
  La page d'origine de Google ne peut pas s'afficher : elle appartient à la couche navigateur de
  Chrome, absente du moteur qu'Electron embarque.

## [0.68.0] — 2026-07-26

### Corrigé

- **Le retour « téléportait » sur la page précédente une seconde plus tard**, environ une fois
  sur deux. Cliquer « retour » pendant que la page charge encore (banal sur des résultats de
  recherche) laissait la navigation en vol se committer APRÈS le retour, l'écrasant — d'où
  l'intermittence, selon que le chargement avait eu ou non le temps de finir. Le chargement en
  cours est désormais explicitement annulé avant de reculer (et d'avancer). Test de
  non-régression à l'appui.
- **Une image personnelle rendait les textes invisibles.** Deux causes cumulées : le voile était
  calculé sur les 10 % de pixels les plus clairs — trop indulgent, le texte ne se pose pas sur
  la moyenne — et l'analyse à 32×32 lissait justement les zones claires locales qui gênent la
  lecture. Désormais 64×64 et 3 % les plus clairs. Surtout, **les images DÉJÀ importées voient
  leur voile recalculé automatiquement au démarrage** : plus besoin de réimporter son fond pour
  bénéficier d'un correctif de lisibilité.
- **La clé `settings.appearance.useImageColor` s'affichait telle quelle** dans les réglages —
  supprimée par erreur en 0.63.0 alors qu'elle restait utilisée. Le bouton s'appelle maintenant
  « Accent d'après l'image », avec une pipette et un aperçu de la couleur d'accent en cours.
  Un test vérifie désormais que toute clé référencée existe bien, pour que l'oubli ne puisse
  plus se reproduire.

## [0.67.0] — 2026-07-26

### Corrigé

- **Le bouton « retour » ramenait à la recherche précédente — cause réelle enfin trouvée.** Les
  pages de résultats Google réécrivent leur URL en permanence (`pushState`). Or le repère
  « cette page est à un pas de la page d'accueil » était recalculé à CHAQUE navigation commitée,
  `did-navigate-in-page` comprise : il était donc effacé une fraction de seconde après avoir été
  posé, et le retour retombait sur l'historique natif — correct par coïncidence au premier cycle,
  faux dès le second. Seuls deux évènements le font désormais évoluer : nos propres navigations,
  et `will-navigate` (l'utilisateur part vraiment ailleurs).
- **Le bouton latéral de la souris ne revenait pas à la page d'accueil** — il est traité par
  Chromium lui-même et ne passe jamais par le code d'ÆTHER. Plutôt que d'intercepter chaque
  chemin séparément, c'est l'historique natif qui est désormais purgé de ses entrées périmées
  (`loadURL` n'écrase pas la branche « avancer », contrairement à une vraie barre d'adresse).
  Flèche, bouton de souris, Alt+Flèche gauche et geste tactile sont corrigés d'un seul coup.
- Cinq tests de non-régression couvrent ces séquences, dont le `pushState` et le retour purement
  natif — ils échouent bien sans les correctifs.

### Modifié

- **Plus de cartes sombres derrière les textes de la page d'accueil.** La lisibilité passe
  désormais par un vrai calcul de contraste (même méthode que WebAIM / Coolors) : les tons de
  texte secondaires sont remontés au-dessus du seuil WCAG AA quand un thème est actif, et le
  voile de fond est dimensionné pour garantir 4.5:1 sur la couleur de texte **la plus sombre** de
  la page — pas seulement la principale, comme c'était le cas. C'est le texte qui s'adapte au
  fond, jamais un cadre opaque posé par-dessus.

### Ajouté

- **Cinq thèmes vivants** — Aurore boréale, Pulsar, Prisma, Marée et Solstice : des couches de
  lumière qui dérivent, tournent et pulsent en continu. Animées uniquement en
  `transform`/`opacity`, elles sont composées par le GPU sans aucun coût de mise en page ni de
  repeinte, et se figent d'elles-mêmes si le système demande de réduire les animations. Leur
  vignette dans les réglages est animée elle aussi. Le contraste reste garanti même au pire
  empilement des couches (vérifié : minimum 5.7:1).

## [0.66.0] — 2026-07-26

### Corrigé

- **Le bouton « retour » ramenait à la recherche précédente au lieu de la page d'accueil** — la
  vraie cause, cette fois localisée : `navigate()` écrit l'URL cible en base AVANT de lancer le
  chargement, si bien que l'URL « précédente » relue plus tard depuis la base valait déjà la
  NOUVELLE. Le repère « cette page est à un pas de la page d'accueil » était donc effacé par la
  navigation même qui venait de le poser, et le retour retombait sur l'historique natif — dont
  Electron ne purge jamais la branche obsolète. Le suivi de l'URL précédente est désormais
  indépendant de la base. Une recherche depuis la page d'accueil ramène systématiquement à la
  page d'accueil, autant de fois d'affilée qu'on le veut.
  Couvert par trois tests de non-régression qui rejouent la séquence complète (dont le cycle
  double qui échouait) — ils échouent bien sans le correctif.

### Amélioré

- **Lisibilité garantie sur une image importée, plus seulement estimée** — le voile n'est plus
  déduit d'une luminance moyenne (trompeuse : une voiture sombre devant un ciel clair donnait une
  moyenne basse et un texte illisible sur le ciel) mais calculé pour ATTEINDRE le contraste
  minimum WCAG AA (4.5:1) sur les zones claires de l'image, par recherche dichotomique. L'image
  n'est jamais assombrie plus que nécessaire — ni moins. Cinq tests vérifient la garantie,
  y compris les cas limites (image quasi noire, reflet spéculaire isolé).
- **Actualités, météo, horloge et raccourcis lisibles sur tout fond** — surfaces en verre dépoli
  nettement plus opaques et ombres portées sur les textes sans surface propre, là où ils se
  noyaient dans la photo.
- **Un thème restyle vraiment toute l'application** — au-delà du fond et des icônes, chacun des
  8 thèmes porte sa propre palette de surfaces (panneaux, barres, cartes) et sa couleur d'accent,
  appliquées aussi aux menus contextuels et aux invites de permission (fenêtres séparées, qui
  restaient jusqu'ici sur la teinte par défaut).

### Modifié

- **Le choix du thème a déménagé dans Réglages › Apparence** — il ne concerne plus seulement la
  page d'accueil, sa place n'était donc plus dans le panneau « Personnaliser » de celle-ci.

## [0.65.0] — 2026-07-26

### Corrigé

- **Le bouton « retour » retombait sur l'ANCIENNE recherche au lieu de la page d'accueil**,
  après un cycle recherche → retour → NOUVELLE recherche → retour — la purge de branche
  d'historique de la 0.64.0 n'y suffisait pas. Le retour vers `aether://newtab` ne dépend plus
  DU TOUT de l'historique natif de Chromium pour cette étape précise : la page courante sait
  désormais elle-même, de façon déterministe, qu'elle est à exactement un pas d'un nouvel
  onglet tout juste quitté, et y retourne directement.

### Amélioré

- **Lisibilité de la page de nouvel onglet sur un fond personnalisé** — voile de lisibilité
  calibré automatiquement (fixe et réglé à la main par thème intégré ; calculé depuis la
  luminance moyenne pour une image importée, plus sombre = voile plus léger), surfaces en verre
  dépoli sur la barre de recherche et les icônes de raccourcis, ombre portée sur les textes nus
  (horloge, libellés) — lisible quel que soit le fond choisi.
- **Choisir un thème intégré restylise maintenant le navigateur complet** — sa couleur d'accent
  (boutons, surbrillances) et un voile assorti sur la bande de titre/les marges, pas seulement
  le fond de la page d'accueil.

## [0.64.0] — 2026-07-25

### Ajouté

- **Fond d'écran de la page de nouvel onglet, de retour** — cette fois scopé à la page
  d'accueil elle-même (panneau « Personnaliser », plus dans Réglages) au lieu du fond de
  l'appli entière : une `WebContentsView` de page compose toujours par-dessus le DOM, donc le
  fond général restait invisible dès qu'une page était ouverte, ce qui le rendait quasi
  inutile. Huit dégradés composés de plusieurs lueurs superposées (Aurore, Nébuleuse, Braise,
  Abysses, Orchidée, Crépuscule, Météore, Émeraude), une image personnelle importable, et un
  bouton pour en extraire la couleur dominante comme accent — le tout bien visible cette fois,
  avec un voile de lisibilité automatique par-dessus l'image/le dégradé.

### Corrigé

- **Après un retour vers la page d'accueil suivi d'une NOUVELLE recherche, un premier clic
  « retour » retombait sur l'ANCIENNE recherche au lieu de la page d'accueil** — `loadURL()`,
  contrairement à une navigation d'adresse dans un vrai navigateur, n'écrase jamais la branche
  « avancer » restée au-delà de la position courante ; la nouvelle page s'empilait par-dessus
  l'ancienne branche au lieu de la remplacer. Cette branche obsolète est désormais purgée à
  chaque navigation, comme le ferait un vrai navigateur.

## [0.63.0] — 2026-07-25

### Supprimé

- **Mode clair retiré de l'application** — ÆTHER ne propose plus qu'un thème sombre unique ; le
  sélecteur « Sombre / Clair / Suivre le système » a disparu de Réglages › Apparence, ainsi que
  tout le CSS conditionnel associé.
- **Le sélecteur de fond d'écran (dégradés/image personnalisée)** — retiré avec le thème. Il était en
  pratique quasi invisible (une `WebContentsView` de page compose toujours par-dessus le fond peint
  sur `<body>`, donc rien ne se voyait avec une page ouverte) et signalé comme non fonctionnel : les
  clics sur les vignettes ou le choix d'une image ne produisaient aucun effet visible.

### Corrigé

- **Le bouton « retour » restait grisé après une recherche depuis la page d'accueil**, malgré le
  correctif de la 0.62.1 — cause racine différente cette fois : l'historique natif de Chromium
  n'inscrit pas toujours de façon fiable une entrée exploitable pour le document minimal
  `aether://newtab` une fois qu'on l'a quitté pour une vraie page. Le calcul de « peut revenir en
  arrière » s'appuie désormais aussi sur un filet de secours (une page née d'un nouvel onglet peut
  toujours y retourner), indépendant de ce que rapporte l'historique natif.
- **Glisser une carte éveillée dans la Toile faisait « nager » son contenu** — la vraie vue native de
  la page (repositionnée par un aller-retour IPC asynchrone) décalait légèrement du cadre de la carte
  (déplacé, lui, en synchrone) pendant le geste. La vue native est désormais masquée le temps du
  glisser, remplacée par un aperçu figé — cadre et contenu voyagent enfin ensemble, comme une carte
  endormie.

## [0.62.1] — 2026-07-24

### Corrigé

- **Le bouton « retour » restait grisé après une recherche depuis la page d'accueil** (vraie cause) —
  le schéma standard `aether:` normalise l'URL en `aether://newtab/` (barre oblique finale) une fois
  la page chargée, si bien que la comparaison stricte à `'aether://newtab'` échouait : l'appli créait
  un NOUVEL onglet au lieu de naviguer la page d'accueil en place (d'où aussi les onglets « Page
  d'accueil » qui s'accumulaient). La détection utilise désormais un préfixe, donc la recherche
  navigue bien en place et `aether://newtab` reste une vraie entrée « retour ».
- **La barre d'adresse affichait encore « newtab »** au lieu de « Nouvel onglet » / « Page d'accueil »
  — dernier emplacement resté sur l'ancien libellé, corrigé.
- **Micro-freezes en glissant une carte de la Toile** — deux causes résiduelles traitées : le flou
  d'arrière-plan (`backdrop-blur`) des boutons d'action, recalculé à chaque frame pendant le
  mouvement, est retiré ; et les rectangles des cartes voisines (pour l'aimantation) sont désormais
  calculés une seule fois au début du geste au lieu d'à chaque évènement souris (l'allocation
  répétée saturait le ramasse-miettes).

## [0.62.0] — 2026-07-24

### Corrigé

- **Le bouton « retour » restait grisé après une recherche depuis un nouvel onglet** — impossible de
  revenir à la page d'accueil, il fallait rouvrir un onglet. Quand la vue d'un nouvel onglet doit
  être (re)créée au moment de la recherche, `aether://newtab` est désormais chargé et validé
  D'ABORD, puis l'URL cible empilée par-dessus : le nouvel onglet devient une vraie entrée « retour ».
- **Fermer l'onglet courant ne revenait pas au dernier onglet actif** — on tombait sur l'écran
  « Par où commencer ? » alors que d'autres onglets restaient ouverts. Une pile des onglets
  récemment utilisés fait désormais revenir au DERNIER onglet actif encore ouvert (ex. 3 onglets,
  on passe de apple.fr à amazon.com, on ferme amazon.com → retour sur apple.fr).
- **Glisser une carte de la Toile pouvait saccader** — la carte est maintenant promue sur sa propre
  couche de composition GPU le temps du geste, évitant de re-peindre une carte lourde à chaque
  déplacement.

### Modifié

- **La page de nouvel onglet s'appelle « Page d'accueil »** (au lieu de « newtab ») et son titre
  « Nouvel onglet » (au lieu de « Sans titre »), partout : bande d'onglets, cartes de la Toile,
  liste des pages, aperçus, constellation.

## [0.61.5] — 2026-07-24

### Corrigé

- **Glisser une carte de la Toile décollait son contenu de son cadre** (cadre vide laissé sur place,
  contenu rogné/détaché, vue vivante disparue) — le correctif précédent (v0.61.4) appliquait la
  transformation de déplacement à un élément INTÉRIEUR (contenu seul), si bien que seul le contenu
  bougeait pendant que le cadre (bordure/fond) restait figé. Restructuré proprement : un conteneur
  extérieur ordinaire porte désormais la position, la taille ET le déplacement de la carte entière
  (cadre + contenu ensemble), tandis que l'animation d'apparition (framer-motion) est isolée sur un
  élément intérieur dédié — les deux ne partagent plus jamais la même propriété `transform`.

## [0.61.4] — 2026-07-24

### Corrigé

- **Glisser une carte de la Toile faisait sauter sa position de façon erratique** (« téléportations »
  pendant qu'on la tenait, bouton/élément inattendu affiché par moments) — le déplacement écrivait
  directement `transform` sur le `motion.div` (framer-motion) de la carte, qui réaffirme sa propre
  valeur de cette propriété à chaque re-rendu (mount, changement d'un titre de page en tâche de
  fond…), effaçant la position en cours de glisser plusieurs fois par seconde. Le déplacement
  s'écrit désormais sur un élément DOM ordinaire imbriqué, jamais géré par framer-motion.

## [0.61.3] — 2026-07-24

### Corrigé

- **Réveiller une carte demandait de cliquer deux fois** (la première tentative faisait un
  mouvement bizarre) — une capture d'aperçu différée, déclenchée en arrière-plan à l'apparition de
  la carte, pouvait détruire la vue tout juste réveillée si elle se terminait pendant que la carte
  venait d'être activée. La destruction ignore désormais les cartes réveillées sur la Toile.
- **Aimantation instable, avec des « téléportations »** — la première version couplait les deux
  axes à la paire de coins la plus proche : un tout petit mouvement de souris pouvait faire changer
  cette paire et faire sauter la carte d'un coup. Chaque axe (horizontal, vertical) s'aimante
  maintenant indépendamment sur les bords des cartes voisines, sans jamais entraîner l'autre axe —
  fonctionne aussi correctement quelle que soit la différence de taille entre les deux cartes.
- **Lumière blanche défilant sur les contours des cartes** — c'était la barre de progression de
  chargement (undulation « shimmer »), bien plus visible depuis que les cartes peuvent être
  réveillées et réellement naviguées. Retirée des cartes de la Toile.

## [0.61.2] — 2026-07-24

### Corrigé

- **Le menu du sélecteur de profil s'affichait dans le style natif de Windows/Chrome**, pas celui
  d'ÆTHER — remplacé par la même bulle DOM (glass-strong) que tous les autres menus contextuels de
  l'appli. Corrige au passage, plus proprement, le bascule ouvert/fermé au reclic.
- **Le contenu d'une carte éveillée devenait tout noir en zoomant la Toile vers l'avant** — la vue
  native se masquait entièrement dès qu'elle dépassait le cadre visible d'un seul pixel (recadrage
  tout-ou-rien). Elle affiche désormais la portion réellement visible, recadrée, plutôt que de
  disparaître complètement.
- **Aimantation des cartes revue** — elle ne se déclenche plus que lorsque deux COINS de cartes
  s'approchent l'un de l'autre (façon deux aimants), sans repère visuel affiché. Le repli sur la
  grille de fond a été retiré : il donnait l'impression que la carte « suivait un quadrillage »
  pendant tout le glisser, au lieu de rester fluide.

## [0.61.1] — 2026-07-24

### Corrigé

- **La vérification des mises à jour affichait un échec brut et technique (dump JSON des en-têtes
  HTTP) sur une simple coupure réseau/passerelle GitHub temporaire** (ex. 502/503/504) — ce type
  d'erreur, déjà observé sur les assets GitHub Releases juste après publication, se résout
  généralement de lui-même en réessayant quelques secondes plus tard. La vérification retente
  désormais discrètement (2 fois, avec délai croissant) avant d'afficher un message clair et
  compréhensible en cas d'échec persistant.

## [0.61.0] — 2026-07-24

### Ajouté

- **Aimantation des cartes sur la Toile** — en déplaçant une carte, elle s'aligne désormais
  automatiquement sur les bords/centres des cartes voisines (avec repères visuels, façon Figma), ou
  à défaut sur la grille de fond.

### Corrigé

- **Icônes des actions de carte (Toile) pas bien centrées** — `shrink-0` manquant sur les boutons,
  pouvant les laisser se comprimer hors de leur carré.
- **Le sélecteur de profil se rouvrait instantanément en recliquant dessus pour le fermer** — ce
  reclic est, du point de vue d'Electron, un clic EN DEHORS du menu natif (même sur son propre
  déclencheur), qui se fermait donc tout seul juste avant que la demande de fermeture explicite
  n'arrive, la faisant repartir pour une réouverture immédiate. Une courte garde anti-réouverture
  résout la course.
- **Réveiller un nouvel onglet vierge sur la Toile affichait une page noire** — `aether://newtab`
  est un composant React (jamais une vraie page web, voir le mode Focus), pas branché dans le
  nouveau mode « carte interactive ». Réveiller un tel onglet affiche désormais la vraie page de
  nouvel onglet, comme en mode Focus.
- **Une carte éveillée débordait par-dessus toute l'interface en zoomant/déplaçant la vue** — une
  vue native compose indépendamment de tout découpage CSS (`overflow: hidden`) : dès que la carte
  sortait partiellement du cadre visible de la Toile, sa vue continuait de s'afficher à son
  rectangle réel, qui pouvait chevaucher n'importe quel autre panneau. Elle se masque désormais
  entièrement tant que la carte n'est pas intégralement dans le cadre visible.

## [0.60.0] — 2026-07-24

### Ajouté

- **Rendre une carte interactive directement sur la Toile** — nouveau bouton « Rendre interactive »
  (actions au survol d'une carte) qui réveille une vraie page vivante et navigable à même la carte,
  sans quitter le mode Toile ni passer par le mode Focus. Un bouton « Remettre en veille » (bande
  d'identité) revient à l'aperçu statique — capture un aperçu frais au passage.

### Corrigé

- **Icône du sélecteur de profil toujours décentrée au repos** (v0.59.x) — deux causes traitées :
  absence de `line-height` explicite sur le glyphe (l'ancien centrage ne centrait que la boîte de
  ligne, pas l'encre du glyphe) et bascule de couche de composition au survol (le bouton reste
  désormais en permanence sur sa propre couche, repos et survol utilisent le même rendu).
- **Zoom de la Toile trop restreint** — plafond relevé de 250% à 300% ; zoom arrière quasi illimité
  (4% au lieu de 22%, ~25× plus de surface visible).
- **Amplitude de redimensionnement des cartes trop faible** — plage élargie (160×115 minimum,
  1440×1040 maximum, contre 260×180/780×580 avant).
- **Flou persistant en zoomant sur une carte (aperçu ET boutons), net seulement au clic** — la
  toile restait figée sur une couche de composition bitmap en permanence ; elle ne l'est désormais
  que pendant le geste actif, et se re-rastérise proprement (sans clic nécessaire) une fois le
  zoom/pan stabilisé.
- **Glisser-déposer d'une carte saccadé** — chaque mouvement de souris réécrivait l'intégralité du
  store des pages, provoquant un nouveau rendu de toute la Toile à chaque frame. Le déplacement/
  redimensionnement s'écrit désormais directement dans le DOM pendant le geste (comme le pan/zoom
  de la caméra), le store n'étant mis à jour qu'une seule fois au relâchement.

## [0.59.1] — 2026-07-23

### Corrigé

- **Le rafraîchissement d'aperçu au zoom (Toile, v0.59.0) ne se déclenchait presque jamais en pratique** — le seuil comparait la largeur effective à l'écran à la résolution cible des aperçus (1600px), mais une carte à sa taille par défaut (360px) ne dépasse jamais 900px même au zoom maximal : la quasi-totalité des cartes ne se rafraîchissaient donc jamais. Remplacé par un rafraîchissement systématique (une fois par page) dès qu'une carte apparaît sur la Toile.
- **Les cartes jamais ouvertes en mode Focus cette session restaient floues même après un rafraîchissement demandé** — `capture()` ne faisait rien en l'absence de vue vivante (le mode Toile n'en monte aucune). Une vue temporaire, invisible, est désormais créée le temps de la capture puis détruite si elle n'a pas d'autre raison de rester active.

## [0.59.0] — 2026-07-23

### Corrigé

- **Ouvrir un deuxième nouvel onglet ne faisait plus rien** — le bouton « + » re-naviguait silencieusement la carte « Nouvel onglet » déjà active vers elle-même au lieu d'en créer une nouvelle, dès qu'un premier nouvel onglet vierge était déjà ouvert.
- **La mise à jour n'affichait plus la petite barre de progression d'avant** — l'assistant d'installation complet (Réparer/Supprimer, introduit en v0.56.0) s'invitait aussi pendant les mises à jour automatiques. Deux installeurs distincts sont désormais publiés à chaque release : l'assistant complet pour le téléchargement manuel, un « un clic » silencieux dédié exclusivement à l'auto-updater.
- **Sélecteur de profil (haut à droite) pas centré au repos**, ne se recentrant qu'au survol — corrigé.
- **Le sélecteur de profil ne se refermait pas en recliquant dessus** alors qu'il était déjà ouvert — un second menu s'empilait silencieusement par-dessus le premier.
- **Aperçus flous/pixélisés en zoomant sur une carte en mode Toile** — les captures sont désormais faites à une résolution et une qualité plus élevées, et rafraîchies automatiquement pour les cartes déjà ouvertes quand le zoom dépasse la résolution capturée.

### Ajouté

- **Bouton « Voir le certificat »** dans le popover du cadenas (section « La connexion est sécurisée ») — remplace un petit lien texte discret par une vraie rangée pleine largeur, cohérente avec le reste du menu.
- **Menu « ⋮ » par site** dans « Gérer les données des sites sur l'appareil » — deux nouvelles actions par origine : ne pas autoriser l'enregistrement des données (bloque les cookies pour ce site), et supprimer ses données à la fermeture de toutes les fenêtres.
- **Menu contextuel des favoris complet, façon Chrome** — sur un favori : ouvrir dans un nouvel onglet/une nouvelle fenêtre/une vue fractionnée/une fenêtre de navigation privée, modifier son titre/URL, couper/copier/coller, ajouter une page/un dossier, afficher ou non la barre de favoris. Sur un espace vraiment vide de la barre : tout ouvrir (variantes fenêtre/navigation privée), coller, ajouter une page/un dossier, afficher la barre.
- **Menus contextuels dans le panneau Constellation (mode Focus)** — clic droit sur un point (page) : mêmes actions que la bande d'onglets. Clic droit sur un espace : « Fermer tous les onglets » (l'espace reste, vide) et « Fusionner avec… » (déplace les pages vers un autre espace puis dissout celui-ci).

## [0.58.0] — 2026-07-23

### Ajouté

- **Budget quotidien d'appels IA cloud** (Réglages › IA) — plafond configurable sur les appels Claude/OpenAI/Grok (0 = illimité, 300/jour par défaut), protège d'une facture surprise en cas de bug ou de boucle qui martèle l'API. Ollama (local, gratuit) n'est jamais concerné. Compteur remis à zéro chaque jour, affiché en temps réel dans Réglages.
- **Option « ne pas envoyer les informations système »** dans « Signaler un problème » — case à cocher qui omet version d'ÆTHER/Electron/Chromium/OS du mail envoyé, pour les utilisateurs qui préfèrent ne partager que leur description du problème.
- **Tests e2e smoke** (Playwright, vrai processus Electron via `_electron`) — 3 scénarios : démarrage + ouverture d'une page depuis la Barre d'Intention, bascule Focus/Toile, création d'un espace. `npm run test:e2e`, chaque run dans un profil temporaire isolé (jamais le profil réel).

### Corrigé

- **`better-sqlite3` pouvait rester compilé pour la mauvaise ABI (Node au lieu d'Electron) après `npm test`**, malgré un `npm run rebuild` signalé « réussi » — `electron-builder install-app-deps` fait confiance à un cache qui ignore qu'un `npm rebuild` ciblant Node a entre-temps écrasé le binaire réellement lié. Symptôme réel : l'app plante silencieusement au lancement juste après avoir lancé les tests. `posttest` (et le nouveau `pretest:e2e`) utilisent désormais `scripts/rebuild-native-for-electron.mjs`, qui republie inconditionnellement via `@electron/rebuild` (`force: true`) sans jamais faire confiance à un cache.

## [0.57.1] — 2026-07-20

### Documentation

- **Marche à suivre complète pour SignPath Foundation** (README, section Signature) — vérifiée directement sur signpath.org : critères d'éligibilité, lien de candidature, compromis à connaître (le certificat identifie « SignPath Foundation », pas « ÆTHER », dans SmartScreen), et l'étape de workflow GitHub Actions prête à coller une fois approuvé (signature à distance, différente du `CSC_LINK` local déjà câblé). Mention d'Azure Trusted Signing (~10 $/mois) comme repli payant si le délai d'approbation gratuit pose problème.

## [0.57.0] — 2026-07-20

### Ajouté

- **Cible portable Windows** (`Aether-Portable-X.Y.Z.exe`) en plus de l'installeur NSIS — un seul exécutable autonome, sans installation ni écriture registre. Publié automatiquement aux côtés de l'installeur sur chaque release.
- **Vérification d'intégrité** — un `SHA256SUMS.txt` est désormais généré et publié avec chaque release (empreintes de l'installeur, du portable et du blockmap), pour permettre de vérifier qu'un téléchargement n'a pas été altéré.
- **Infrastructure de signature de code (prête, pas activée)** — `electron-builder.yml` détecte automatiquement `CSC_LINK`/`CSC_KEY_PASSWORD` si définies au moment du build, sans configuration supplémentaire. Documentation complète dans le README (génération d'un certificat auto-signé pour du dev, et pourquoi ça ne suffit **pas** à faire disparaître SmartScreen pour une distribution publique — la seule voie gratuite et réellement efficace, SignPath.io Foundation, demande une candidature côté mainteneur).
- **Métadonnées de packaging** — `copyright` renseigné, algorithme de signature figé sur SHA-256 seul (au lieu du défaut SHA-1+SHA-256, hérité de la compatibilité Windows Vista/7, inutile ici).

## [0.56.0] — 2026-07-20

### Ajouté

- **Installeur Windows façon assistant classique** — remplace l'ancien mode « un clic » qui installait directement sans la moindre interaction. Nouveau parcours : Bienvenue → Conditions de licence (MIT) → Installation → Fin, avec lancement optionnel d'Aether à la fin. L'emplacement d'installation reste fixe (comme avant) pour ne jamais casser la pose des mises à jour par-dessus l'existant.
- **Détection d'une installation déjà présente** (façon iTunes) — relancer l'installeur alors qu'Aether est déjà installé affiche désormais un choix explicite Réparer (réinstalle les fichiers manquants ou endommagés) ou Supprimer (lance le vrai désinstalleur), au lieu d'écraser silencieusement l'installation existante sans prévenir.

### Note

- Le message SmartScreen (« Windows a protégé votre ordinateur ») au premier lancement de l'installeur n'est **pas** corrigé par ce lot — aucune configuration ne le fait disparaître sans un certificat de signature de code réel (achat + vérification d'identité). Piste explorée pour une prochaine fois : SignPath Foundation offre des certificats gratuits aux projets open source qui remplissent leurs critères (licence OSI, dépôt public, CI active) — ÆTHER (MIT, GitHub public) semble éligible, mais la démarche de candidature revient à l'utilisateur.

## [0.55.0] — 2026-07-19

### Ajouté

- **Refonte complète de la bulle « informations du site »**, façon Chrome — navigation interne dans la même bulle (« La connexion est sécurisée » et « Cookies et données des sites » ouvrent désormais un vrai détail, sans changer de fenêtre), et les lignes de permission ne s'affichent plus que si le site les a RÉELLEMENT utilisées (un site n'ayant jamais rien demandé n'affiche plus aucune ligne, comme github.com dans Chrome). Le menu déroulant ask/allow/block est remplacé par une simple bascule Autoriser/Bloquer + un bouton « Réinitialiser l'autorisation » séparé.
- **Caméra et microphone désormais distingués** dans les autorisations par site (auparavant un seul kind combiné « média ») — la bulle affiche « Caméra » et « Micro » séparément selon ce qui a été utilisé, chacun avec son propre historique et sa propre surcharge.
- **9 nouvelles catégories d'autorisation par site** : MIDI, presse-papiers, accès aux fichiers, sons, cookies, images, JavaScript, popups et redirections, téléchargements automatiques, contenu non sécurisé — en plus des trois déjà existantes (localisation, notifications, média).
- **Moteur de blocage de contenu par site** — cookies, images et scripts externes peuvent désormais être réellement bloqués par origine (surcharge de site ou réglage global), de même que les popups/redirections automatiques et les téléchargements déclenchés sans action de l'utilisateur. Limite assumée : seuls les `<script src>` externes sont couverts pour JavaScript, pas le code inline (Electron n'offre pas de bascule dynamique pour désactiver le JS par origine).
- **« Gérer les données des sites sur l'appareil »** — nouvelle fenêtre listant le site de la page et les origines tierces qui y sont intégrées (traceurs, widgets de paiement…), avec suppression des données par origine.
- **Page « Tous les sites »** (Réglages › Confidentialité) — registre de toutes les origines ayant stocké des cookies dans le profil, regroupées par domaine avec la taille réelle des données (via CDP) et le nombre de cookies, dépliable pour voir chaque sous-domaine séparément.
- **Page de réglages complète par site** (15 catégories : les 14 ci-dessus + niveaux de zoom), accessible depuis la bulle du site (« Paramètres des sites ») ou depuis « Tous les sites » — poids et nombre de cookies avec bouton de suppression, chaque autorisation réglable individuellement (Demander/Autoriser/Bloquer), et un bouton pour tout réinitialiser d'un coup.

### Corrigé

- **« Récemment utilisés »** : une autorisation de site conserve désormais la trace de son dernier usage même après réinitialisation du choix (Demander), pour que la bulle continue de savoir qu'elle a déjà été sollicitée.

## [0.54.0] — 2026-07-19

### Ajouté

- **Invite de permission (caméra/micro, localisation, notifications)** — jusqu'ici, un site qui demandait une de ces permissions était silencieusement refusé, sans le moindre signe visible (« rien ne se passe »). Une vraie bulle Autoriser/Bloquer apparaît désormais, façon Chrome, quand aucun choix n'est déjà mémorisé pour ce site. Nouvelle fenêtre native dédiée (`permissionPromptWindow.ts`), délibérément séparée du système de popover partagé : elle doit survivre à un clic dans la page (contrairement aux autres popups, qui se ferment sur ce même clic) et garantir qu'un callback Electron en attente est TOUJOURS résolu (fermeture de fenêtre, navigation, Échap → refus non mémorisé ; réponse explicite → mémorisée). File d'attente si plusieurs demandes arrivent en même temps.
- **Section « Autorisations par site »** (Réglages › Confidentialité) — vue d'ensemble de tous les choix mémorisés par origine (caméra/micro, localisation, notifications), modifiables ou réinitialisables directement depuis Réglages, sans repasser par chaque site un par un.
- **Lecteur de certificat façon Chrome** — remplace l'ancien bloc de texte minimal dans la bulle « informations du site » par une vraie page (onglets Général/Détails, hiérarchie de certificats jusqu'à la racine, empreintes SHA-256 du certificat et de la clé publique, bouton Exporter). Version X.509 et algorithme de signature affichés seulement quand réellement disponibles (jamais devinés).

### Corrigé

- **Bouton « Fermer » des Réglages** mal placé (texte + icône en bas de la barre latérale) — remplacé par une simple croix en haut à droite, comme les autres fenêtres (Historique, Téléchargements, Favoris).
- **Menus déroulants des Réglages qui coupaient leur texte avec un fondu** même quand il y avait de la place — même bug déjà corrigé pour la pilule d'intention (v0.53.10), racine identique dans le composant de menu déroulant : le fondu ne s'applique désormais que si le texte déborde réellement.
- **Popover « informations du site » lent à s'afficher** — les données sont maintenant récupérées avant l'ouverture du popup, plus d'attente d'un aller-retour réseau une fois affiché (même technique déjà utilisée pour la bulle de dossier de favoris).
- **Menu déroulant des permissions qui ne s'ouvrait pas** dans cette même bulle — remplacé le `<select>` natif (incompatible avec une fenêtre popup non focusable) par le menu déroulant personnalisé de l'appli, restructuré pour ne jamais être rogné par les bords de la bulle.

## [0.53.10] — 2026-07-19

### Corrigé

- **CI GitHub Actions dépréciée (avertissement Node.js 20)** : `actions/checkout`/`actions/setup-node` en `@v4` (runtime interne Node 20, en fin de vie) → `@v5` (runtime Node 24 natif) ; version Node du workflow de release passée de 20 à 22.
- **Pilule d'intention (titre/domaine de la page active) coupée par le fondu malgré la place disponible** : `.fade-truncate` applique un dégradé de sortie à largeur FIXE (16px), quel que soit le contenu — pour un texte court comme « cia.gov » (≈60px), ces 16px représentent ~27% du mot entier, faisant disparaître ses derniers caractères dans le fondu même quand rien ne débordait réellement. Le dégradé ne s'applique désormais que si le texte DÉBORDE vraiment sa boîte (nouveau hook `useOverflowFade`, comparaison `scrollWidth`/`clientWidth`) — un texte qui tient entièrement s'affiche maintenant en entier, sans fondu cosmétique.

## [0.53.9] — 2026-07-19

### Corrigé

- **Zone invisible autour des bulles de popup empêchant de les fermer en cliquant ailleurs** : la fenêtre popup native est délibérément un peu plus grande que la carte visible (marge anti-rognage + largeur réservée pour un flyout, menu principal) — mais cette marge fait partie de la fenêtre NATIVE, qui passe au-dessus de la fenêtre principale. Un clic dedans atteignait donc cette fenêtre popup (même sur fond transparent) et n'atteignait jamais le détecteur global de clic-extérieur de la fenêtre principale, obligeant à cliquer nettement à l'écart de la bulle pour la fermer. Le popup ferme désormais lui-même dès qu'un clic ne touche aucune carte visible en son sein.

## [0.53.8] — 2026-07-19

### Corrigé

- **Menu principal (⋯) impossible à fermer / qui scintillait et se rouvrait en boucle** — vraie cause enfin identifiée (analyse image par image : la fenêtre du popup oscillait en opacité, curseur immobile). App.tsx pose un écouteur `pointerdown` GLOBAL sur `window` qui masque le popup à CHAQUE clic dans la chrome (pour fermer les menus contextuels). En cliquant le bouton pour fermer : ce `pointerdown` global masquait le popup (→ `popover:onClosed` → état « fermé »), puis le `click` (au relâchement) relisait « fermé » et RÉOUVRAIT le menu. Chaque clic = masqué à l'appui, réaffiché au relâchement : scintillement sans fin, bouton bloqué en surbrillance. Les boutons à popup (menu principal, extensions, traduction, mise à jour, infos de site, dossiers de favoris) basculent désormais sur `pointerdown` + `stopPropagation`, ce qui décide au même instant que le handler global et l'empêche de s'exécuter pour ce clic précis — plus de course. Les correctifs précédents (garde 250 ms, surbrillance distincte, garde de resize) ne pouvaient pas régler ça car la fermeture venait du handler GLOBAL, jamais du `close()` du bouton.

## [0.53.7] — 2026-07-19

### Corrigé

- **Menu principal (⋯) qui se rouvrait tout seul à la fermeture, et bouton bloqué en surbrillance** — analyse image par image d'un nouvel enregistrement (build vérifié comme étant bien le dernier). Trois causes cumulées, toutes corrigées :
  - **Réouverture automatique** : le `ResizeObserver` du popup (dont le contenu reste monté, la fenêtre n'étant que masquée entre deux usages) pouvait émettre un dernier rapport de taille APRÈS la fermeture ; le `setBounds()` qui suivait RÉAFFICHAIT la fenêtre masquée sur Windows (`SetWindowPos` réactive la visibilité) — le menu se rouvrait tout seul juste après un clic de fermeture. Tout redimensionnement d'un popup masqué (et pas en cours d'affichage) est désormais ignoré.
  - **Surbrillance trompeuse** : l'état « ouvert » du bouton (fond blanc à 6 %) était quasi indiscernable du simple survol (5 %) — un bouton FERMÉ mais survolé paraissait « sélectionné », l'utilisateur croyait le menu encore ouvert et recliquait, ce qui le rouvrait. L'état ouvert est maintenant nettement plus marqué (fond à 14 % + texte plein).
  - **Défensif** : l'exécution d'une commande depuis le menu prévient désormais explicitement le renderer de la fermeture (`popover:onClosed`), comme les autres chemins de fermeture — le bouton ne peut plus rester « ouvert » après avoir cliqué une action.

## [0.53.6] — 2026-07-19

### Corrigé

- **Bouton du menu principal (⋯) qui restait allumé et rouvrait le menu en boucle à la fermeture** : un signal asynchrone (`popover:onClosed`, ou un rebond de focus dû au redimensionnement natif du popup) repassait l'état du bouton à « fermé » ENTRE le `pointerdown` et le `click` du même clic, si bien que le `click` retombait sur la branche « ouvrir » et rouvrait aussitôt le menu — impossible à fermer, bouton bloqué en surbrillance. Ajout d'une garde : toute réouverture dans les 250 ms qui suivent une fermeture est ignorée (un vrai second clic délibéré est toujours plus lent). Casse la boucle quelle que soit la cause exacte de la course.

## [0.53.5] — 2026-07-19

### Corrigé

- **Sous-menu « Aide » (bas de liste) mal aligné** : depuis le passage du flyout en `position:absolute` (v0.53.4), le menu ne saute plus, mais un sous-menu bas de liste était remonté de force pour ne pas dépasser sous le menu — désaligné de la ligne cliquée, contrairement à « Rechercher et modifier » (haut de liste) qui, lui, s'alignait bien. Le flyout s'aligne désormais TOUJOURS sur la ligne cliquée : quand il descend plus bas que le menu racine, c'est la fenêtre popup qui s'agrandit vers le BAS pour le rendre entièrement visible — son haut restant épinglé, le menu racine ne bouge pas d'un pixel (toujours aucun saut).

## [0.53.4] — 2026-07-19

### Corrigé

- **Menu principal qui « saute » vers le haut à l'ouverture d'un sous-menu**, définitivement. Analyse image par image d'un nouvel enregistrement (build vérifié comme étant bien le dernier, octet pour octet) : à CHAQUE ouverture de flyout, toute la fenêtre remontait de ~7px puis redescendait à la fermeture — le correctif `position:relative` (v0.53.2) n'avait PAS supprimé le problème (le flyout, resté dans le flux, continuait de coupler son état à la taille mesurée de la fenêtre). Refonte de l'architecture du menu : le flyout est désormais en `position:absolute` — **totalement hors flux** — donc il ne peut plus, en aucune circonstance, modifier la taille mesurée de la boîte (largeur réservée en dur, hauteur définie par le seul menu racine). La fenêtre popup native ne se redimensionne ni ne se repositionne plus jamais quand on ouvre/ferme un sous-menu. Le flyout est en plus borné verticalement pour toujours tenir dans la hauteur du menu (aligné sur la ligne cliquée quand il rentre, remonté juste ce qu'il faut sinon), donc son bas n'est jamais rogné non plus.

## [0.53.3] — 2026-07-19

### Corrigé

- **Coin arrondi du bas du menu principal toujours rogné net**, confirmé par analyse image par image d'un nouvel enregistrement après le fix précédent (v0.53.2 — pourtant bien celui installé et testé, vérifié octet pour octet) : le repositionnement au clic sur un sous-menu bas de liste (« menu qui remonte ») est bien corrigé, mais la fenêtre restait systématiquement quelques pixels trop courte pour le coin arrondi du bas — le texte n'était pas coupé, seuls le padding et le rayon de bordure finaux manquaient. Cause probable : arrondi de sous-pixels lors de la conversion des bornes de fenêtre en pixels physiques sur un facteur d'échelle Windows non entier (125 %, 150 %…). Corrigé en ajoutant une marge de sécurité (8px) directement à CHAQUE mesure réelle remontée par le popup (pas seulement à la hauteur devinée avant mesure) — sans risque, la fenêtre popup est intégralement transparente.

## [0.53.2] — 2026-07-19

### Corrigé

- **DevTools ancrées qui s'ouvraient TOUJOURS comme une fenêtre à part**, même après avoir attaché la vue avant `setDevToolsWebContents` (v0.53.1) : il manquait `mode: 'detach'` sur l'appel `openDevTools()` qui suit — sans lui, Electron tente de gérer un partage gauche/droite/bas *dans la fenêtre principale elle-même*, ce qu'une simple `WebContentsView` de page ne permet pas, et retombe silencieusement sur sa fenêtre interne détachée. C'est la valeur documentée par Electron pour cet usage précis : combiné à `setDevToolsWebContents`, `'detach'` ne veut plus dire « fenêtre séparée » mais « peins-toi dans le conteneur que je t'ai donné ». Notre propre ancrage gauche/droite/bas reste géré à côté, indépendamment de ce mode.
- **Menu principal qui remontait au clic sur un sous-menu bas de liste** (ex. « Aide ») : le flyout était positionné avec `margin-top`, une propriété qui compte dans le calcul de hauteur du conteneur flex — ouvrir un sous-menu loin dans la liste racine gonflait donc la hauteur *mesurée* du popup, faisant remonter toute la fenêtre pour rester à l'écran. Remplacé par un décalage `position:relative`, purement visuel, qui ne change plus jamais la hauteur mesurée.
- **Bas du menu principal parfois coupé net (coin non arrondi)** au tout premier affichage : la hauteur devinée avant la vraie mesure était calquée sur la largeur (620px) sans rapport avec la hauteur réelle du panneau — trop courte, elle coupait le contenu réel le temps que la correction arrive. Rendue largement plus généreuse (une fenêtre transparente n'affiche jamais l'espace en trop) et le recalcul qui suit repart maintenant systématiquement de la position idéale d'origine plutôt que de la position déjà affichée (qui pouvait rester coincée après un premier clamp).

## [0.53.1] — 2026-07-19

### Corrigé

- **DevTools ancrées qui s'ouvraient encore comme une vraie fenêtre à part** (avec sa propre barre de titre) : la vue DevTools était liée à `setDevToolsWebContents` avant même d'être attachée à la fenêtre ÆTHER — Electron l'ignorait silencieusement et retombait sur sa fenêtre interne détachée. Corrigé en attachant la vue d'abord.
- **Scintillement résiduel du menu principal** : le `ResizeObserver` du popup se redéclenchait à chaque ouverture/fermeture de sous-menu même quand la taille finale ne changeait pas d'un pixel, provoquant un redimensionnement natif inutile (donc une recomposition visible de la fenêtre transparente) à chaque clic. Ignoré désormais quand les bornes calculées sont identiques aux bornes actuelles.

## [0.53.0] — 2026-07-18

### Ajouté

- **DevTools réellement ancrées** (gauche/droite/bas, Réglages › Système) : `openDevTools({mode})` seul n'a aucun effet pour une page qui est une `WebContentsView` attachée (pas une vraie fenêtre à elle) — les DevTools sont désormais une vue native que l'appli crée et positionne elle-même à côté de la page, partageant l'espace au lieu de toujours s'ouvrir dans une fenêtre séparée.

### Corrigé

- **Menu principal parfois désaxé/coupé au premier affichage** : la toute première position calculée (avant la vraie mesure du contenu) supposait encore l'ancienne largeur sans flyout — corrigé pour refléter la largeur réellement réservée dès le départ.

## [0.52.4] — 2026-07-18

### Corrigé

- **Sous-menu du menu principal qui scintillait** à l'ouverture : la fenêtre popup (transparente) se redimensionnait alors qu'elle était déjà affichée, provoquant une recomposition visible sur Windows. Le popup réserve désormais une largeur fixe dès le premier affichage — ouvrir/fermer un sous-menu ne redimensionne plus jamais la fenêtre native, juste une transition d'opacité.
- **Sous-menu toujours calé en haut du menu** au lieu du niveau de la ligne cliquée (ex. « Aide », loin dans la liste) : il s'aligne maintenant sur la ligne exacte qui l'a ouvert.
- **Retiré le réglage d'ancrage des DevTools** (gauche/droite/bas) : confirmé sans effet — limitation d'Electron (l'ancrage n'existe que pour le contenu propre d'une vraie fenêtre, pas pour une `WebContentsView` attachée comme le sont les pages d'ÆTHER), pas quelque chose de réparable côté appli. Les DevTools s'ouvrent en fenêtre détachée, comme avant ce réglage.

## [0.52.3] — 2026-07-18

### Corrigé

- **Ancrage des DevTools sans effet** (toujours en fenêtre détachée quel que soit le réglage) : Electron ignore le réglage d'ancrage demandé si des DevTools sont déjà ouvertes sur la page — elles se contentaient de reprendre le premier plan dans leur état déjà en cours au lieu du nouveau. Ferme désormais toute session déjà ouverte avant de rouvrir avec le réglage actuel. **Non vérifié visuellement** — à confirmer.

## [0.52.2] — 2026-07-18

### Corrigé

- **Sous-menu du menu principal décalait tout le menu** : ouvrir un sous-menu (« Aide », « Caster et partager »…) près du bord droit de l'écran repositionnait toute la bulle vers la gauche au lieu de garder le menu racine immobile. Le menu reste désormais parfaitement fixe ; le sous-menu s'ouvre à côté en grandissant du bon côté (celui où il y a de la place, jamais en poussant hors écran).

### Ajouté

- **Email de rapport de bug stylisé** (au lieu d'un texte brut) + informations de version/OS en pied de page.
- **Pièces jointes** sur « Signaler un problème » (jusqu'à 10 fichiers, 20 Mo au total).

## [0.52.1] — 2026-07-18

### Corrigé

- **« Rechercher dans la page » restait bloqué à 0/0** en tapant : chaque frappe relançait une nouvelle recherche qui annulait la précédente avant que Chromium n'ait eu le temps de rapporter le moindre résultat — seul Entrée (qui continue la recherche en cours au lieu d'en relancer une) laissait un résultat passer. Court anti-rebond (150 ms) sur la saisie, toujours perçu comme instantané.

## [0.52.0] — 2026-07-18

### Ajouté

- **Fond d'écran** (Réglages › Apparence) : quelques dégradés prédéfinis, ou une image importée depuis le PC — visible derrière les pages (bande de titre, marges du canvas). Bouton « Utiliser la couleur de l'image » pour appliquer automatiquement sa couleur dominante comme accent (façon Windows).
- **« Signaler un problème »** : vraie interface (titre + description) au lieu d'un simple lien `mailto:` — envoi automatique par SMTP si configuré, sinon repli sur le client mail. Les identifiants SMTP (miens, pas ceux d'un utilisateur final) sont chiffrés localement (même mécanisme que les clés IA), jamais exposés au renderer ni à aucun autre utilisateur de l'appli.

## [0.51.0] — 2026-07-18

### Modifié

- **Navigation privée** ouvre désormais une vraie fenêtre séparée (façon Chrome/Edge) au lieu de basculer la fenêtre courante.
- **Changer de profil** (menu avatar, Réglages › Profils) ouvre une fenêtre dédiée à ce profil — ou ramène au premier plan celle déjà ouverte dessus s'il y en a une — au lieu de basculer la fenêtre courante.

### Ajouté

- **Vraie interface de création de profil** : nom et avatar (icône, couleur ou image importée) se choisissent avant même que le profil n'existe, au lieu d'un profil instantané au nom générique.
- Liste des profils désormais synchronisée en temps réel entre toutes les fenêtres ouvertes.

## [0.50.0] — 2026-07-18

### Ajouté

- **Sous-menus du menu principal en flyout** (« Caster et partager », « Plus d'outils »…) : s'ouvrent désormais à côté du menu, qui reste affiché — au lieu de le remplacer entièrement. Même correctif pour les menus contextuels génériques (favoris, dossiers, espaces…).
- **Position des outils de développement** (Réglages › Système) : fenêtre à part (comportement historique) ou ancrés à gauche/droite/en bas de la fenêtre ÆTHER.

### Corrigé

- **Troncature de texte qui ne se déclenchait pas malgré le fondu prévu** : la barre d'adresse, les listes déroulantes, l'historique et d'autres endroits gardaient le texte entier au lieu de le tronquer quand la place manquait — un enfant flex refuse par défaut de rétrécir sous la largeur de son contenu, corrigé au niveau des utilitaires CSS partagés (`truncate`/`fade-truncate`) plutôt que fichier par fichier.

## [0.49.1] — 2026-07-18

### Corrigé

- **Téléchargements manuels non journalisés** : « Enregistrer la page sous… » et la capture d'écran écrivaient le fichier sans jamais l'ajouter au panneau Téléchargements.
- **Bouton du menu principal (⋯) bloqué « ouvert »** après une action (ex. « Enregistrer la page sous… ») : il fallait cliquer deux fois pour le rouvrir — le popup ne prévenait jamais son bouton d'origine de sa propre fermeture.
- **Retour arrière grisé après une recherche depuis le nouvel onglet** : la recherche ouvrait une nouvelle carte au lieu de naviguer la carte newtab existante, qui n'avait donc aucun historique.
- **Notifications de téléchargement mal ciblées en multi-fenêtre** : elles ne partaient toujours que vers la toute première fenêtre à avoir ouvert le profil, jamais les autres fenêtres partageant ce même profil.
- **Espace actif parfois périmé après changement de profil** : l'état en mémoire d'une fenêtre pouvait rester bloqué sur un ancien espace au lieu du dernier réellement sélectionné.

### Ajouté

- **Nouvel onglet déjà ouvert au lancement** (réglage « Ouvrir cette page — toujours neuve ») : le nettoyage des onglets périmés se fait désormais avant le tout premier rendu, plus de flash d'état vide.
- **Aperçu des téléchargements récents au survol** de son icône : quand aucun téléchargement n'est en cours, affiche les 6 derniers terminés des dernières 24h au lieu d'un message vide.

## [0.49.0] — 2026-07-17

### Ajouté

- **Support multi-fenêtre natif** : ÆTHER peut désormais ouvrir de vraies fenêtres supplémentaires, avec la même parité de fonctionnalités que la fenêtre principale (espaces/pages/favoris/notes partagés par profil, chacune avec son propre état d'agrandissement/plein écran).
- **« Nouvelle fenêtre »** (Ctrl+N, menu principal, sous « Nouvel onglet ») : ouvre une nouvelle fenêtre ÆTHER sur le profil actif.
- **« Ouvrir dans une nouvelle fenêtre » / « …en navigation privée »** dans le menu contextuel d'un lien.
- Fermer une fenêtre secondaire ne ferme plus toute l'application — seule la dernière fenêtre restante applique le réglage « minimiser au lieu de fermer ».

## [0.48.2] — 2026-07-17

### Ajouté

- **Menu contextuel des images** : ÆTHER ne détectait pas du tout le clic droit sur une image — « Ouvrir l'image dans un nouvel onglet », « Enregistrer l'image sous… », « Copier l'image », « Copier l'adresse de l'image », « Créer un QR code pour cette image », et « Inspecter l'élément ».
- **« Afficher le code source de la page »** dans le menu contextuel d'une page.

### Renommé

- « Ouvrir dans une nouvelle carte » → « Ouvrir dans un nouvel onglet » (menu contextuel d'un lien), pour un vocabulaire plus proche des autres navigateurs.

## [0.48.1] — 2026-07-17

### Corrigé

- **Le popup de traduction se fermait à tort en revenant à l'original sur certains sites** : le rechargement déclenché par « Afficher l'original » pouvait provoquer PLUSIEURS évènements de focus rapprochés sur des pages complexes (redirections, scripts tiers) — seul le premier était couvert par la garde anti-fermeture, les suivants fermaient la bulle. La garde couvre désormais toute la fenêtre de temps, pas un seul évènement.
- **La traduction ne faisait rien sur les sites avec un CSP strict** (GitHub notamment) : les requêtes vers l'API de traduction se faisaient jusqu'ici depuis la page elle-même, bloquées silencieusement par le `Content-Security-Policy` du site. Elles partent désormais du process principal, qui n'est soumis à aucun CSP de page.

## [0.48.0] — 2026-07-17

### Ajouté

- **Popup de traduction repensé** (façon bulle native Chrome/Edge) : la langue détectée et la langue cible sont désormais deux onglets côte à côte — celui qui correspond à l'état affiché est mis en avant, cliquer l'autre bascule directement dessus (avant : bouton « Traduire »/« Original » séparé des noms de langue).
- **« Toujours traduire les pages rédigées en… »** : nouvelle case à cocher dans ce popup, réellement fonctionnelle — les pages détectées dans une langue cochée sont désormais traduites automatiquement dès leur chargement, sans repasser par le popup.

## [0.47.2] — 2026-07-17

### Ajouté

- **Édition des notes** (Muse) : cliquer une note l'ouvre en édition (ou l'icône crayon au survol) — jusqu'ici création/suppression uniquement.
- **Indicateurs de performance** (Réglages › Performance) : nombre de pages vivantes, mémoire approximative, taille du dossier d'aperçus.
- **Accessibilité de base** : rôles/labels ARIA sur la bande de pages (`role="tab"`), les actions d'espace de la Constellation, les notes de Muse, et le nouveau menu déroulant des réglages (`listbox`/`option`).
- **Support Linux** (config `electron-builder.yml`, cibles AppImage + deb) — **non vérifié** : ce dépôt n'a été packagé/testé que sur Windows, le workflow de release ne construit/publie encore que la cible Windows.

## [0.47.1] — 2026-07-17

### Ajouté

- **Documentation** : `ARCHITECTURE.md` (décisions structurantes), `SCHEMA.md` (tables SQLite + historique des migrations), `CONTRIBUTING.md` (installation, tests, conventions).
- **Résistance réseau des appels IA** : nouvelle tentative (jusqu'à 3, délai croissant) sur un échec réseau/serveur transitoire — jamais sur une clé refusée (401/403, retenter à l'identique échouerait pareil) ni une fois qu'une réponse a commencé à s'afficher (éviterait de dupliquer une réponse déjà partiellement montrée).
- **Nettoyage des embeddings orphelins au démarrage** : filet de sécurité en complément du nettoyage proactif ajouté en v0.46.1 (bases migrées depuis avant ce nettoyage, ou coupure en plein milieu d'une suppression).

### Optimisé

- **Nombre de pages gardées en mémoire** : la valeur initiale (avant tout réglage manuel) s'adapte désormais à la RAM de la machine plutôt qu'une valeur fixe identique pour tous.
- **`ollamaBaseUrl`** : validé (schéma `http(s):` uniquement) avant d'être enregistré, pour éviter qu'une valeur malformée ne refasse surface de façon imprévisible dans un appel réseau plus tard.

## [0.47.0] — 2026-07-17

### Ajouté

- **Suite de tests** (Vitest, 25 tests) : dépôts SQLite de bout en bout (migrations jusqu'à v10, CRUD, cascade embeddings), routeur IA (repli entre providers, abandon en vol), ViewManager (création paresseuse des vues, LRU, éviction mémoire), schémas de validation IPC. `npm test` — voir CONTRIBUTING.md pour la subtilité de compilation native (`better-sqlite3`) entre Node et Electron.
- **Validation des payloads IPC complexes** (Zod) : les canaux qui reçoivent des objets structurés côté renderer (géométrie de fenêtre/canvas, requêtes IA, options d'ouverture de page, entrées de menu de favoris) sont désormais validés avant traitement — une valeur malformée (NaN/Infini, champ manquant, type inattendu) est rejetée proprement au lieu de risquer de faire planter le process principal ou de corrompre un état.

## [0.46.2] — 2026-07-17

### Ajouté

- **Journal d'erreurs local** (`userData/logs/aether.log`, rotation simple) : quelques échecs qui se dégradaient jusqu'ici en silence total laissent désormais une trace exploitable — repli d'un provider IA vers un autre pendant une conversation, échec d'un embedding (Ollama puis OpenAI), échec du chargement/rechargement d'une extension. Purement local, aucune télémétrie, rien n'est envoyé nulle part.

## [0.46.1] — 2026-07-17

### Corrigé

- **Embeddings orphelins à la suppression d'un espace ou d'un profil** : les pages/notes disparaissent déjà en cascade avec leur espace (contrainte SQL), mais leurs embeddings (colonne sans clé étrangère) ne suivaient jamais — ils restaient en base pour de bon. Nettoyés explicitement dans les deux cas désormais.

### Optimisé

- **Base de données** : ajout d'un index sur `favorites(profil, url)`, réellement utilisé par la recherche/suppression d'un favori par URL (contrairement à la recherche d'historique, un `LIKE` qu'aucun index ne peut accélérer).

## [0.46.0] — 2026-07-17

À partir de cette version : suivi d'une analyse externe exhaustive du projet (voir mémoire), traité point par point par priorité.

### Ajouté

- **Licence** : fichier `LICENSE` (MIT) ajouté à la racine — `package.json` la déclarait déjà, mais GitHub ne la détectait pas faute du fichier.
- **Nettoyage des aperçus de pages** : les miniatures JPEG orphelines (page supprimée avec son espace/profil, ou après un crash) sont désormais purgées au démarrage, avec une limite de 500 Mo/2000 fichiers (éviction des plus anciennes au-delà). Bouton « Nettoyer maintenant » dans Réglages › Données.

### Corrigé

- **Profils de navigation privée après un crash** : leur suppression n'avait lieu qu'à la fermeture propre de l'application (`will-quit`) — un crash ou un arrêt forcé laissait le profil et toutes ses données (espaces, pages, favoris, visites) en base indéfiniment, prêt à réapparaître au lancement suivant. Un même nettoyage tourne désormais aussi au démarrage.

## [0.45.3] — 2026-07-17

### Ajouté

- **Historique — suppression individuelle** : chaque visite peut désormais être effacée seule (croix au survol), pas seulement tout l'historique d'un coup.
- **Historique — confirmation avant purge totale** : le bouton « Tout effacer » demande désormais une confirmation explicite (action irréversible) au lieu d'effacer immédiatement.

### Corrigé

- **En-tête des réglages** : le titre et le champ de recherche restaient jusqu'ici DANS la liste défilante des sections — sur un réglage tout en bas, ils disparaissaient avec le reste. Ils sont désormais fixes, seule la liste des sections défile.
- **Bulles popup (infos de site, aperçu d'onglet…)** : un angle de la fenêtre restait visible en dehors du coin arrondi de la carte — l'ombre portée large de `.popover-surface` n'avait pas la place de s'estomper avant d'atteindre le bord d'une fenêtre dimensionnée exactement à son contenu, et se retrouvait coupée net. Ombre retirée pour ces fenêtres, un simple liseré suffit.
- **Menu déroulant des réglages** (ouverture d'un lien, plage de suppression des données…) : rendu par l'OS (fond noir, surbrillance bleue Windows), impossible à styler — remplacé par un vrai menu déroulant au style ÆTHER.
- **Nouvel onglet et bouton « retour »** : une recherche lancée quasi immédiatement après l'ouverture d'un nouvel onglet pouvait annuler le tout premier chargement de `aether://newtab` avant qu'il ne s'inscrive dans l'historique de navigation — le bouton « retour » n'avait ensuite rien vers quoi revenir. La recherche attend désormais que ce premier chargement soit engagé.

## [0.45.2] — 2026-07-17

### Optimisé

- **Recherche dans l'historique (champ de recherche/omnibox)** : la requête de recherche (déclenchée à chaque frappe) filtrait jusqu'ici sur TOUT l'historique enregistré, dont la taille ne fait que croître au fil des mois/années d'utilisation — un scan lent aurait bloqué toute l'application à chaque frappe (la base étant synchrone). Bornée désormais aux 3000 visites les plus récentes avant le filtrage, pour un coût constant quelle que soit la taille de l'historique.

## [0.45.1] — 2026-07-16

### Optimisé

- **Bande de pages et barre de favoris** : le tri/filtrage des listes affichées (onglets de l'espace actif, favoris racine + par dossier) est désormais mémoïsé au lieu d'être recalculé à chaque rendu — ces composants ont plusieurs états locaux qui changent très souvent (survol, glisser-déposer, infobulle), ce qui déclenchait un recalcul inutile de la liste à chaque mouvement de souris.

## [0.45.0] — 2026-07-16

### Ajouté

- **Filet de sécurité contre les écrans blancs** : une erreur de rendu React non rattrapée n'importe où dans l'appli affiche désormais un écran de récupération (« Recharger ») plutôt que de démonter toute l'interface sans recours — les espaces, pages et données restent intacts, seule la fenêtre a besoin d'être rechargée.

### Optimisé

- **Démarrage plus rapide** : les panneaux peu utilisés (Réglages, Historique, Téléchargements, Favoris, recherche d'onglets, gestionnaire de tâches, QR code, renommer la fenêtre, guide, introduction) sont désormais chargés à la demande plutôt qu'au lancement — environ 250 Ko de moins à analyser avant le tout premier affichage.
- **Liste des extensions** : la taille de chaque extension (calculée en parcourant tous ses fichiers) est désormais mise en cache au lieu d'être recalculée à chaque ouverture de la liste — un parcours répété pouvait geler brièvement toute l'application pour une extension un peu volumineuse.
- **Base de données** : `synchronous = NORMAL` (recommandation officielle de SQLite en mode WAL, déjà actif) — réduit les micro-blocages liés aux écritures fréquentes (historique, position de la caméra, état du focus) sans risque de corruption.

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
