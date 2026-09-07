# Handoff — Refonte « blocs teintés » (Journal, Récaps, Tâches)

## Ce que contient ce dossier

- `Recap mobile.dc.html` — la maquette interactive complète. **C'est une référence de design**, pas du code à copier : elle est écrite en HTML/JS autonome pour montrer l'apparence et le comportement voulus. Le travail consiste à **recréer ces écrans dans le codebase existant** (Next.js App Router + Tailwind v4 + Supabase), avec ses patterns actuels.
- `avatar.jpeg` — déjà présent dans le repo (`public/avatar.jpeg`), listé pour mémoire.

Fidélité : **haute**. Les couleurs, tailles, graisses, rayons et espacements ci-dessous sont ceux à appliquer.

La maquette contient 4 tours d'exploration empilés (le plus récent en haut). **Seul le tour 4 est validé** : options `4a` (Journal), `4b` (Récaps), `4c` (Tâches). Les tours 1 à 3 sont l'historique, à ignorer.

## Portée

1. Nav passe de 4 à 3 onglets — `Profil` sort du menu, accessible uniquement par l'avatar du header.
2. Refonte graphique du Journal : suppression des catégories, humeur en emoji.
3. Refonte graphique des Récaps : questions à creuser en tête + archive des traitées, périodes calendaires.
4. Refonte graphique des Tâches dans le même langage.

---

## 1. `src/components/BottomNav.tsx`

Retirer l'entrée `/profile` du tableau `tabs`. Garder Journal, Tâches, Récap — les trois `d` SVG et le traitement actif/inactif (`fill` + `text-primary`) restent identiques.

Le header de chaque page conserve `<Avatar />`, qui pointe déjà vers `/profile` : aucun changement dans `Avatar.tsx`.

Hauteur de barre 74px (`h-[74px]`), fond `bg-surface/90 backdrop-blur-xl`, bordure haute `border-outline-variant/30`, `pb-[env(safe-area-inset-bottom)]`.

---

## 2. Langage visuel commun

Une couleur par nature de contenu. Une carte = un bloc, pas de bordure, rayon très large.

| Rôle | Fond | Texte | Usage |
|---|---|---|---|
| Écrit par l'utilisateur | `#ffffff` + ombre carte | `#1b1c1a` | entrées de journal, tâches libres |
| Sommeil / Arpentons | `#b9ecee` | `#1b1c1a`, secondaire `#3c6c6e` | blocs Garmin sommeil, projet Arpentons |
| Tâches accomplies / génération | `#ffdf96` | `#1b1c1a`, secondaire `#735802` | tâche bouclée dans le journal, bloc « nouvelle synthèse » |
| Neutre / activité | `#efeeea` | `#1b1c1a`, secondaire `#717975` | corps sans activité, archives |
| Focus / Snooze | `#386458` | `#f4fffa`, secondaire `rgba(244,255,250,.7)` | bloc « à garder en tête », projet Snooze |
| Action forte | `#1b1c1a` | `#fbf9f5` | bouton Générer |

Rayons : cartes blanches d'entrée **26px**, blocs teintés **22px**, gros blocs (questions, synthèse) **28px**, pastilles d'historique **24px**, pills `rounded-full`.

Ombre carte blanche uniquement : `0px 10px 30px rgba(94,139,126,0.08)`. Les blocs teintés n'ont **pas** d'ombre.

Header de page (identique sur les 3 onglets) : `px-[18px] pt-4`, avatar 40px `rounded-full object-cover`, titre 22px / 700 / `-0.02em`, action à droite (rond 40px `bg-surface-container` ou pill).

FAB : 60px, `bg-primary`, `+` 26px, `bottom: 98px; right: 18px`, ombre `0 12px 30px rgba(56,100,88,.34)`.

Padding horizontal du contenu : **18px**. Gap entre blocs d'un même jour : **8px**. Entre sections : 26px.

---

## 3. `src/app/(app)/journal/page.tsx` — option `4a`

### Suppression des catégories

- Retirer le sélecteur `categories` du formulaire, et l'affichage du label/emoji de catégorie dans la timeline.
- `journal_entries.category` est `not null` avec un `check` en base : le plus simple est d'insérer **toujours** `category: 'quotidien'` et de ne plus jamais l'afficher. Aucune migration nécessaire. (Si tu préfères nettoyer : `alter table journal_entries alter column category drop not null;` puis retirer la contrainte.)
- Le type `JournalCategory` et le champ dans `src/types/index.ts` peuvent rester, non utilisés en UI.

### Humeur en emoji

L'humeur n'est plus une pill texte (`bien`) mais **l'emoji seul**, 26px, posé en haut à droite de la carte d'entrée. Le tableau `moods` existant fournit déjà les emoji (`😄 🙂 😐 😤 😰`) — garder `value` en base, n'afficher que `emoji`. Pas de label. Si `mood` est nul, rien n'est affiché (pas de placeholder).

Le sélecteur d'humeur dans le formulaire reste une rangée d'emoji ; l'état sélectionné garde `bg-tertiary-container`.

### Timeline

Groupée par jour, en-tête de jour = deux textes sur une ligne : nom relatif (15px/700 `#1b1c1a` — « Aujourd'hui », « Hier », sinon « mardi 2 septembre » capitalisé) + date longue (12px `#717975`) quand le nom relatif s'applique. Marge basse 12px.

Ordre à l'intérieur d'un jour : entrée(s) écrite(s), puis la rangée corps/sommeil, puis les tâches bouclées.

**Carte d'entrée** — blanc, rayon 26px, `p-5`, ombre carte :
- ligne flex : texte `flex-1` en 16px / line-height 26px / `#1b1c1a` / `text-wrap: pretty` — puis emoji d'humeur `flex-none`, 26px, `line-height:1`, gap 12px
- heure en pied : 11.5px `#717975`, `margin-top:14px`

**Rangée corps / sommeil** — deux blocs `flex-1` côte à côte, gap 8px, rayon 22px, `p-4` :
- label 11px / 700 / `letter-spacing:.04em` / `uppercase`
- valeur 22px / 700 / `-0.02em` `#1b1c1a`, `margin-top:6px`
- précision 11.5px, `margin-top:2px`
- sommeil : fond `#b9ecee`, label et précision `#3c6c6e` (`7h20` / `profond`)
- activité : fond `#efeeea`, label `#404845`, précision `#717975` (`vélo` / `48 min` / `512 kcal`). Sans activité : valeur `—`, précision « pas d'activité ».

**Tâche bouclée** — fond `#ffdf96`, rayon 22px, `px-[18px] py-[15px]`, flex gap 12px : rond 22px `bg-tertiary` avec `✓` `#fffbff` 11px/700, puis contenu 13.5px/700 `#1b1c1a` et étiquette 11.5px `#735802`.

Le bouton « + Nouvelle entrée » du header devient le **FAB** ; le bouton sync Garmin devient le rond 40px du header.

---

## 4. `src/app/(app)/recap/page.tsx` — option `4b`

Ordre de la page : questions à creuser → archive → générateur → historique.

### Bloc « à garder en tête »

Fond `#386458`, rayon 28px, `p-[22px]`, texte `#f4fffa`.
- en-tête : label 11px/700 `letter-spacing:.08em` uppercase `rgba(244,255,250,.75)` + compteur (« 2 ouvertes ») même style, alignés `baseline`, marge basse 18px
- une question = flex gap 14px : case ronde 26px `border 1.5px rgba(244,255,250,.45)` fond transparent (cible tactile 44px min via padding conteneur), puis à droite question 16px / line-height 25px / 500 / `text-wrap: pretty`, origine 11px `rgba(244,255,250,.65)` et bouton « Écrire là-dessus » (fond `rgba(244,255,250,.16)`, texte `#f4fffa`, 11.5px/700, `px-3.5 py-2`, `rounded-full`)
- gap 18px entre questions

Cocher une question la **retire du bloc et la place dans l'archive**, dépliable juste dessous : ligne « Traitées (n) » 12.5px/600 `#717975` + filet `#e4e2de` + chevron. Chaque archivée : fond `#efeeea`, rayon 20px, texte 13.5px `#404845` `line-through`, origine 11px `#717975`, bouton « Rouvrir » 11.5px/700 `#386458`.

La persistance existe déjà : `localStorage["recap_questions_archived"]`, clé `${recapId}::${questionText}`. La garder telle quelle.

L'extraction reste `extractQuestions()` sur la section `## 🧭 Questions à creuser` du markdown.

### Générateur — périodes calendaires

Remplacer les deux `<input type="date">` par un choix en deux temps. Fond `#ffdf96`, rayon 28px, `p-5`.

1. Segmented `Semaine / Mois / Année` : conteneur `rounded-full` `bg-[rgba(255,251,255,.6)] p-1`, onglet actif `bg-[#1b1c1a] text-[#fffbff]`, inactif transparent `#735802`, 12.5px/700, `py-2.5`.
2. Rangée de périodes concrètes, scroll horizontal (`overflow-x:auto`, scrollbar masquée), pills 12.5px/600 : actif `bg-[#1b1c1a] text-[#fffbff]`, inactif `bg-[rgba(255,251,255,.6)] text-[#735802]`.
3. Ligne de résolution : dates exactes 12.5px/700 `#1b1c1a` à gauche, nombre d'entrées 11.5px `#735802` à droite.
4. Bouton `bg-[#1b1c1a] text-[#fbf9f5]` `rounded-full py-[15px]` 14.5px/600 — libellé « Générer le récap », ou « Régénérer » si un récap existe déjà pour cette période.

**Bornes à calculer côté client, jamais saisies à la main :**
- Semaine : lundi 00:00 → dimanche 23:59:59 (`mondayOf()` existe déjà dans `api/weekly-recap/route.ts`)
- Mois : 1er → dernier jour du mois
- Année : 1er janvier → 31 décembre (année en cours : borné à aujourd'hui)

Proposer les 4 dernières occurrences de la granularité choisie (2 pour l'année), la période en cours en premier avec la mention « en cours » ; les autres portent « déjà généré » ou « jamais généré ».

`POST /api/weekly-recap` accepte déjà `{ weekStart, weekEnd }` en `YYYY-MM-DD` : aucun changement d'API obligatoire. Deux ajustements souhaitables côté route :
- stocker la granularité (ajouter une colonne `kind text` à `weekly_recaps`, valeurs `semaine|mois|annee`) pour l'afficher dans l'historique ;
- le prompt système parle de « semaine » et de « X/7 jours » : le paramétrer selon la granularité (mois → « X/30 », année → pas de routine quotidienne), sinon les récaps mensuels/annuels sortent faux.

Le lien « Autre période… » (texte 12.5px `#717975`) ouvre le double `input date` actuel, conservé en secours.

### Historique

Grille 2 colonnes, gap 10px, pastilles rayon 24px, `p-4`, `min-height:118px`, en colonne :
- granularité 10.5px/700 `letter-spacing:.06em` uppercase `#717975`
- période 15px/700 `-0.01em` `#1b1c1a`, line-height 21px
- tonalité 11.5px `#404845`, poussée en bas (`margin-top:auto`)

Fond selon la tonalité dominante : `#ffdf96` (tension), `#b9ecee` (calme / curieux), `#efeeea` (neutre / fatigue). Clic → écran de lecture du récap (le rendu markdown actuel est conservé).

---

## 5. `src/app/(app)/projects/page.tsx` — option `4c`

Renommer le titre de page en **« Tâches »** (l'onglet s'appelle déjà Tâches). Bouton « Importer » vers `/suggestions` en pill `bg-surface-container text-primary` 12.5px/700.

### Projets

Un bloc teinté par projet, rayon 28px, `p-5`, gap 10px.
- en-tête : rond 40px (fond `rgba(244,255,250,.16)` sur sauge, `rgba(255,255,255,.6)` sur sarcelle) avec `project.icon` 19px ; nom 17px/700 `-0.01em` ; sous-ligne « prochaine édition · 8 septembre » 11.5px ; compteur « n à faire » 11.5px/700 à droite. Marge basse 16px.
- to-do : lignes `py-2.5`, rond 22px `border 1.5px`, texte 14.5px. Coché → fond du rond = couleur de coche, `✓` de la couleur du bloc, texte `line-through` et `opacity:.5`.
- pied : bouton « Ajouter une tâche » pleine largeur, `border 1.5px dashed`, `rounded-full py-2.5`, 12.5px/600 — ouvre l'input existant.

Teintes utilisées dans la maquette : Snooze `#386458` (texte `#f4fffa`, secondaire `rgba(244,255,250,.7)`, tirets `rgba(244,255,250,.35)`, coche `#f4fffa`) ; Arpentons `#b9ecee` (texte `#1b1c1a`, secondaire `#3c6c6e`, tirets `#8fc9cb`, coche `#356668`). Pour les projets suivants, alterner dans l'ordre `#386458`, `#b9ecee`, `#efeeea`, `#ffdf96` — la teinte doit être stable par projet (dérivée de `sort_order`, ou stockée dans une colonne `tint`).

Les dates d'édition restent éditables (`input type="date"` transparent), mais seule la **prochaine** édition est visible dans le bloc ; la dernière édition passe dans l'écran de détail ou en édition au clic.

### Tâches libres

- en-tête de section : « Tâches libres » 14px/700 `#404845` + « n en cours » 12px `#717975`
- filtres : rangée scrollable de pills 11.5px/700, `px-3.5 py-2.5`. « Tout » actif = `bg-[#1b1c1a] text-[#fbf9f5]`. Chaque étiquette active prend **sa** couleur, inactive `bg-[#efeeea] text-[#404845]` :

| Étiquette | Fond actif | Texte actif |
|---|---|---|
| Snooze SAS | `#386458` | `#ffffff` |
| Admin & finance | `#ffdf96` | `#735802` |
| Arpentons | `#b9ecee` | `#3c6c6e` |
| La Grange | `#e4e2de` | `#1b1c1a` |
| LinkedIn | `#dce8f6` | `#0a66c2` |
| Autres | `#c0c8c4` | `#1b1c1a` |

- une tâche : carte blanche rayon 22px `p-4` ombre carte, flex gap 12px — rond 22px `border 1.5px #c0c8c4`, contenu 14.5px `text-wrap:pretty`, étiquette en pill 10.5px/700 `px-2.5 py-1.5` aux couleurs ci-dessus
- liste vide sous un filtre : bloc `#efeeea` rayon 22px, `p-[22px]`, 13.5px `#717975`, centré — « Rien sous cette étiquette »
- archive : même motif que les questions traitées (« Terminées (n) » + filet + chevron), lignes `#efeeea` rayon 20px avec rond `bg-primary` ✓, texte barré `#717975`, bouton « Rouvrir »
- FAB `+` pour ajouter une tâche libre (remplace l'input toujours visible)

---

## Interactions

Aucune animation complexe (le DS demande le calme).
- ouverture d'archive / de liste : `animation: rise .25s ease-out` (`opacity 0→1`, `translateY(6px)→0`)
- cocher : changement instantané, pas de transition de sortie
- génération : le bouton passe en état chargement (le spinner `animate-spin` existant suffit) ; à la fin, ouverture directe du récap généré
- cibles tactiles : jamais moins de 44px de haut pour un élément cliquable

## État

Aucun nouveau store. Ce qui change :
- `recap` : `kind` (`semaine|mois|annee`) + `periodIndex` remplacent `dateFrom`/`dateTo` ; `archOpen` pour l'archive ; l'archive des questions reste en `localStorage`.
- `journal` : suppression de `category` de l'état du formulaire.
- `projects` : `filterTag` et `showDoneTasks` existent déjà ; ajouter la teinte par projet si elle n'est pas stockée en base.

## Tokens

Tous déjà dans `src/app/globals.css` (`@theme`). Valeurs utilisées : `#fbf9f5` `#f5f3ef` `#efeeea` `#e4e2de` `#1b1c1a` `#404845` `#717975` `#c0c8c4` `#386458` `#507d70` `#f4fffa` `#356668` `#b9ecee` `#3c6c6e` `#735802` `#ffdf96` `#fffbff`. Seul ajout hors thème : `#dce8f6` / `#0a66c2` pour l'étiquette LinkedIn (déjà en dur dans le code actuel).

Typo : Plus Jakarta Sans, poids 400/500/600/700, jamais d'all-caps sauf les micro-labels 10.5–11px avec `letter-spacing` .04–.08em.

## Assets

`public/avatar.jpeg` (existant), icônes SVG de `BottomNav.tsx` (existantes), emoji système pour les humeurs et les icônes de projet.

## Fichiers de référence

- `Recap mobile.dc.html` — ouvrir dans un navigateur, tour 4 en haut : `4a` Journal, `4b` Récaps, `4c` Tâches. Les cases à cocher, filtres, sélecteurs de période et archives sont fonctionnels.
