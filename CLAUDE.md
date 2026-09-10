# Arcade Rétro — notes pour Claude

PWA de trois mini-jeux d'arcade en **HTML/CSS/JS pur, sans aucune dépendance ni
étape de compilation**. Code et commentaires en français : conserver ce niveau
d'explication dans toute modification.

## ⚠️ Avant de pousser : incrémenter la version du service worker

Après toute modification d'un fichier **mis en cache** (`index.html`, `app.js`,
`styles.css`, `manifest.json`, `icons/`), incrémenter la constante en haut de
`sw.js` :

```js
const VERSION = 'arcade-retro-v1';   // → v2
```

Sans ce changement, le navigateur ne détecte aucun service worker différent, ne
retélécharge rien, et **toute personne ayant déjà ouvert l'application continue
de voir l'ancienne version**. Le symptôme est trompeur : le dépôt est à jour,
mais l'application ne change pas.

En cas d'**ajout de fichier**, l'inscrire aussi dans la liste `FICHIERS` du même
fichier, sinon il manquera hors ligne.

**Ne pas** incrémenter pour un changement qui ne touche aucun fichier du cache
(README, LICENSE, `.gitattributes`) : cela imposerait un retéléchargement
complet à tous les utilisateurs sans raison.

## Tester en local

```bash
node serveur-local.js   # puis http://localhost:5180
```

Un service worker ne fonctionne **que** sur `https://` ou `http://localhost`,
jamais par double-clic sur `index.html` (`file://`). Les jeux tourneront quand
même, mais ni l'installation ni le mode hors ligne.

Déploiement : GitHub Pages, branche `main`, racine →
https://ferrusdantioch.github.io/arcade-retro/
