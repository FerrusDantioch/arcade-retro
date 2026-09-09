# Arcade Rétro

Trois mini-jeux d'arcade **originaux**, réunis dans une application web installable
qui fonctionne **entièrement hors connexion**.

Aucun nom, logo, dessin, musique ou fichier appartenant à un jeu existant n'a été
utilisé : tous les graphismes sont dessinés par le code lui-même, et tous les sons
sont fabriqués par le navigateur.

| Jeu | Principe | Commandes |
|---|---|---|
| **Chute de Blocs** | Empiler des pièces géométriques et compléter des lignes | ◀ ▶ déplacer · ▲ ou X tourner · ▼ descendre · Espace chute immédiate |
| **Serpent Vorace** | Attraper des pastilles sans se mordre la queue | Flèches ou Z Q S D · glissement du doigt sur le jeu |
| **Défense Orbitale** | Repousser des vagues d'envahisseurs | ◀ ▶ se déplacer · Espace tirer |

Dans les trois jeux : **P** ou **Échap** met la partie en pause. Sur téléphone,
des boutons tactiles s'affichent automatiquement sous le jeu.

## Essayer l'application

Les fichiers sont de simples pages web : un double-clic sur `index.html` suffit
pour jouer. En revanche, les navigateurs n'autorisent le **mode hors ligne** que
sur une adresse `http://`, jamais depuis un fichier ouvert directement. Pour en
profiter, lancez le petit serveur fourni :

```bash
node serveur-local.js
```

puis ouvrez **http://localhost:5180**. N'importe quel autre serveur de fichiers
statiques convient également.

## Installer l'application

Une fois la page ouverte via `http://` :

- **Android / Chrome / Edge** : un bouton « Installer l'application » apparaît en
  bas du menu (ou utilisez le menu du navigateur → « Installer »).
- **iPhone / Safari** : bouton Partager → « Sur l'écran d'accueil ».
- **Ordinateur** : icône d'installation dans la barre d'adresse.

L'application s'ouvre alors en plein écran, sans barre de navigateur, et
fonctionne même en mode avion.

## Les fichiers

```
index.html          la structure des trois écrans (menu, jeu, scores)
styles.css          toute la présentation (couleurs, mise en page, boutons)
app.js              tout le code : moteur, les 3 jeux, scores, navigation
sw.js               le « service worker » : garde une copie pour le hors ligne
manifest.json       la fiche d'identité de l'application (nom, icônes, couleurs)
icons/              les icônes de l'application (3 fichiers PNG)
serveur-local.js    petit serveur de test, facultatif (non utilisé par le jeu)
```

L'application n'utilise **aucune bibliothèque extérieure** et ne fait
**aucun appel réseau** : rien à installer, rien à compiler.

## Les scores

Ils sont enregistrés dans le navigateur (`localStorage`), sur l'appareil
uniquement : aucun serveur, aucun compte, aucune donnée envoyée. Chaque jeu
conserve ses **dix meilleurs scores**, avec le pseudo et la date de la partie.

Effacer les données du site dans le navigateur efface aussi les scores. Le bouton
« Effacer ces scores » de l'écran des classements ne vide que le jeu affiché.

## Modifier le jeu

Quelques réglages faciles à retrouver dans `app.js` :

| Envie | Où regarder |
|---|---|
| Changer les couleurs | les variables `--rose`, `--cyan`… en haut de `styles.css` |
| Rendre la chute des blocs plus lente | `delaiChute()` dans `jeuBlocs` |
| Changer la vitesse du serpent | `intervalle()` dans `jeuSerpent` |
| Donner plus de vies | `this.vies = 3` dans `jeuDefense.init()` |
| Garder plus de scores | `MAXIMUM: 10` dans l'objet `Scores` |

## Publier une nouvelle version

Après avoir modifié un fichier, changez le numéro de version en haut de `sw.js` :

```js
const VERSION = 'arcade-retro-v2';
```

L'ancienne copie mise en cache est alors automatiquement remplacée chez les
joueurs à leur prochaine visite.
