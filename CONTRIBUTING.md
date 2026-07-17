# Contribuer à ÆTHER

## Installation

```bash
npm install    # installe les dépendances + recompile better-sqlite3 pour Electron
npm run dev    # développement avec rechargement à chaud
```

## Avant de proposer une modification

```bash
npm run typecheck   # TypeScript strict (main + renderer)
npm test            # suite de tests (Vitest)
npm run build       # build de production complet
```

Les trois doivent passer. Aucun linter n'est configuré actuellement — le
style s'appuie sur TypeScript strict (`strict`, `noUnusedLocals`,
`noUnusedParameters`) et la cohérence avec le code environnant.

### Piège natif : `better-sqlite3` et `npm test`

`better-sqlite3` est un module natif compilé pour une ABI Node précise.
`npm install`/`npm run rebuild` le recompilent pour l'ABI d'**Electron**
(nécessaire pour `npm run dev`/`build`/`dist`) ; Vitest tourne lui sous
**Node système**, une ABI différente. `npm test` gère ce va-et-vient tout
seul (`pretest` recompile pour Node, `posttest` recompile pour Electron) —
**toujours passer par `npm test`**, jamais `npx vitest` isolément sans y
penser, sous peine d'une erreur `NODE_MODULE_VERSION` ou de casser
silencieusement le prochain `npm run dev`.

## Tests

`tests/*.test.ts`, Vitest. Un test qui touche la base de données ouvre une
instance `:memory:` (`openDatabase(':memory:')`) — jamais de fichier réel sur
disque. Un test qui touche `ViewManager`/du code dépendant d'Electron mocke
`electron` entièrement (voir `tests/view-manager.test.ts` pour le patron).

## Conventions de commit

Pas de format imposé strict, mais en pratique : un message court en français
au présent de l'indicatif (« Corrige… », « Ajoute… », « Traite… »), un corps
qui explique le POURQUOI plutôt que de reformuler le diff. Chaque changement
de comportement utilisateur mérite une entrée dans
[CHANGELOG.md](CHANGELOG.md) (voir sa légende SemVer en tête de fichier) et
un bump de `version` dans `package.json` — c'est ce bump qui déclenche la
release automatique (`.github/workflows/release.yml`).

## Style de code

- Pas de commentaires qui décrivent CE QUE fait le code (les noms
  d'identifiants s'en chargent) — seulement le POURQUOI quand ce n'est pas
  évident (contrainte cachée, contournement d'un bug précis, comportement
  qui surprendrait un lecteur).
- Pas d'abstraction/de configuration ajoutée pour un besoin hypothétique —
  trois lignes similaires valent mieux qu'une abstraction prématurée.
- Toute donnée qui traverse l'IPC depuis le renderer est considérée non
  fiable — valider (Zod, `main/ipcSchemas.ts`) plutôt que supposer la forme
  correcte, en particulier sur les canaux `ipcMain.on` (un throw non
  rattrapé y fait planter tout le process principal).

## Publier une release

Voir la section « Mises à jour automatiques » du [README](README.md#mises-à-jour-automatiques).
En résumé : bump `version` dans `package.json` + entrée `CHANGELOG.md`,
commit, push sur `main` — le reste est automatique.
