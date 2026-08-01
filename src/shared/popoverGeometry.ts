/** Marge invisible ajoutée par CHAQUE popover natif à sa taille RÉELLEMENT
 * mesurée avant de la transmettre au main (`PopoverRoot.tsx`/`reportSize`) —
 * anti-rognage des coins arrondis sur un facteur d'échelle Windows non entier
 * (125 %, 150 %…). Partagée avec le main (popoverWindow.ts) : tout calcul de
 * position qui ancre le bord DROIT ou BAS d'une bulle sur un point précis
 * (bouton, clic) doit soustraire cette marge — sans quoi la carte VISIBLE,
 * plus étroite que la fenêtre qui l'héberge, se retrouve décalée de cette
 * marge par rapport au point visé (signalé par capture utilisateur : chaque
 * bulle légèrement décalée de son bouton). */
export const POPOVER_SAFETY_PX = 8
