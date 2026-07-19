; installer.nsh — première page de l'installeur, avec contenu CONDITIONNEL :
; « Bienvenue » classique pour une première installation, ou « Aether est
; déjà installé → Réparer/Supprimer » (façon iTunes) si une installation
; existante est détectée dans le registre. Insérée par electron-builder via
; `nsis.include` (electron-builder.yml).
;
; Auto-suffisant : inclut lui-même LogicLib.nsh et nsDialogs.nsh plutôt que de
; compter sur un ordre d'inclusion particulier côté template electron-builder
; (ce fichier est injecté AVANT `common.nsh`/`multiUser.nsh` dans le script
; assemblé — voir computeCommonInstallerScriptHeader côté app-builder-lib).
;
; UNE SEULE page (pas « page Réparer/Supprimer + page Bienvenue standard
; sautée conditionnellement ») : `MUI_PAGE_WELCOME`/`MUI_PAGE_FINISH` sont des
; pages MUI2 SPÉCIALES qui ne supportent PAS `MUI_PAGE_CUSTOMFUNCTION_PRE`
; (contrairement à `MUI_PAGE_LICENSE`/`MUI_PAGE_DIRECTORY`/etc.) — impossible
; de les sauter conditionnellement par ce mécanisme (essayé, échoue à la
; compilation : « fonction non référencée »). Une page `Page custom` unique,
; dont le CONTENU varie selon la détection, contourne complètement cette
; limite.
;
; Un clic silencieux d'electron-updater (mise à jour auto, invoqué avec /S) ne
; montre AUCUNE page (comportement natif NSIS en mode silencieux) : seule la
; fonction « leave » (jamais atteinte sans clic explicite) déclenche
; réellement la désinstallation, donc les mises à jour silencieuses ne sont
; jamais affectées par ce choix.

!include "LogicLib.nsh"
!include "nsDialogs.nsh"

; `INSTALL_REGISTRY_KEY`/`UNINSTALL_REGISTRY_KEY` sont normalement définis par
; multiUser.nsh (electron-builder), mais CE fichier est injecté AVANT lui dans
; le script assemblé — les redéfinir ici nous-mêmes, de façon protégée
; (`/ifndef`, donc sans conflit quand multiUser.nsh les définit à son tour
; plus loin — lui-même utilise `/ifndef`), avec EXACTEMENT la même formule.
; `APP_GUID`/`UNINSTALL_APP_KEY` sont, eux, passés en ligne de commande à
; makensis — disponibles dès le tout début, sans ce problème d'ordre.
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define /ifndef UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"

; Tout ce qui suit ne concerne QUE le programme d'installation — inutile (et
; générateur d'un avertissement « fonction non référencée » traité comme une
; erreur par electron-builder) lors de la compilation SÉPARÉE du
; désinstalleur (`BUILD_UNINSTALLER`, voir computeScriptAndSignUninstaller
; côté app-builder-lib) : ce fichier est compilé DEUX FOIS (une fois pour
; extraire l'exécutable du désinstalleur, une fois pour l'installeur final),
; et `customWelcomePage` n'est de toute façon jamais inséré côté désinstalleur
; (voir assistedInstaller.nsh : `!ifndef BUILD_UNINSTALLER`).
!ifndef BUILD_UNINSTALLER

Var AetherExistingInstallDir
Var AetherWelcomeDialog
Var AetherRadioRepair
Var AetherRadioRemove

!macro customWelcomePage
  Page custom AetherWelcomePageCreate AetherWelcomePageLeave
!macroend

; Lit l'emplacement d'une éventuelle installation existante — vide si aucune,
; ou si le dossier trouvé ne contient plus de désinstalleur (installation
; incomplète/corrompue : autant repartir sur un parcours d'installation neuf).
Function AetherDetectExistingInstall
  ReadRegStr $AetherExistingInstallDir SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $AetherExistingInstallDir != ""
    ${ifNot} ${FileExists} "$AetherExistingInstallDir\Uninstall ${PRODUCT_FILENAME}.exe"
      StrCpy $AetherExistingInstallDir ""
    ${endIf}
  ${endIf}
FunctionEnd

Function AetherWelcomePageCreate
  Call AetherDetectExistingInstall

  ; Pas de `MUI_HEADER_TEXT` (barre bleue standard) : cette macro vient de
  ; MUI2.nsh, chargé plus loin dans le script assemblé (même contrainte
  ; d'ordre que pour les REGISTRY_KEY ci-dessus, mais MUI_HEADER_TEXT dépend
  ; d'état interne MUI2 trop lourd à reproduire soi-même) — le titre est
  ; simplement le premier libellé de la page.
  nsDialogs::Create 1018
  Pop $AetherWelcomeDialog
  ${if} $AetherWelcomeDialog == error
    Abort
  ${endIf}

  ${if} $AetherExistingInstallDir != ""
    ${NSD_CreateLabel} 0 0 100% 16u "$(^Name) est déjà installé — que voulez-vous faire ?"
    Pop $0

    ${NSD_CreateLabel} 0 22u 100% 32u "Une version de $(^Name) est déjà installée sur cet ordinateur ($AetherExistingInstallDir). Choisissez une action, puis cliquez sur Suivant."
    Pop $0

    ${NSD_CreateRadioButton} 10u 62u 100% 12u "Réparer — réinstaller les fichiers manquants ou endommagés"
    Pop $AetherRadioRepair
    ${NSD_SetState} $AetherRadioRepair ${BST_CHECKED}

    ${NSD_CreateRadioButton} 10u 78u 100% 12u "Supprimer $(^Name) de cet ordinateur"
    Pop $AetherRadioRemove
  ${else}
    ${NSD_CreateLabel} 0 0 100% 16u "Bienvenue dans l'installation de $(^Name)"
    Pop $0

    ${NSD_CreateLabel} 0 22u 100% 40u "Ce programme va installer $(^Name) ${VERSION} sur cet ordinateur. Il est recommandé de fermer les autres applications avant de continuer. Cliquez sur Suivant pour continuer."
    Pop $0
  ${endIf}

  nsDialogs::Show
FunctionEnd

Function AetherWelcomePageLeave
  ${if} $AetherExistingInstallDir != ""
    ${NSD_GetState} $AetherRadioRemove $0
    ${if} $0 == ${BST_CHECKED}
      ; Lance le VRAI désinstalleur (sa propre confirmation/progression/fin) et
      ; attend qu'il termine avant de quitter cet installeur — pas de
      ; suppression « maison » qui dupliquerait une logique déjà correcte côté
      ; uninstaller.nsh.
      ReadRegStr $1 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString
      ${if} $1 != ""
        ExecWait '$1'
      ${endIf}
      Quit
    ${endIf}
    ; « Réparer » : rien de spécial à faire — la suite du parcours standard
    ; (CGU → installation) réinstalle par-dessus l'existant, ce qui EST la
    ; réparation (fichiers manquants/endommagés remplacés par des copies neuves).
  ${endIf}
FunctionEnd

!endif ; BUILD_UNINSTALLER
