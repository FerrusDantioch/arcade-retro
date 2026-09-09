/* =========================================================================
   Petit serveur local pour tester l'application (facultatif).
   -------------------------------------------------------------------------
   L'application elle-meme n'a besoin d'AUCUN outil : ce sont de simples
   fichiers HTML/CSS/JS. Mais les navigateurs refusent d'activer le mode
   hors ligne (le service worker) quand la page est ouverte directement
   depuis le disque (adresse « file:// »). Ce fichier sert donc juste a
   afficher le jeu a une adresse « http:// ».

   Utilisation :   node serveur-local.js
   Puis ouvrir :   http://localhost:5180
   ========================================================================= */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5180;
const RACINE = __dirname;

/* A chaque extension de fichier correspond un « type de contenu ». */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

http.createServer((requete, reponse) => {
  /* On retire les parametres eventuels puis on securise le chemin demande
     pour qu'il reste a l'interieur du dossier de l'application. */
  const demande = decodeURIComponent(requete.url.split('?')[0]);
  const chemin = demande === '/' ? '/index.html' : demande;
  const fichier = path.join(RACINE, chemin);

  if (!fichier.startsWith(RACINE)) {
    reponse.writeHead(403).end('Accès refusé');
    return;
  }

  fs.readFile(fichier, (erreur, contenu) => {
    if (erreur) {
      reponse.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      reponse.end('Fichier introuvable : ' + chemin);
      return;
    }
    reponse.writeHead(200, {
      'Content-Type': TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream',
      /* Pendant le developpement, on evite que le navigateur garde
         d'anciennes versions des fichiers en memoire. */
      'Cache-Control': 'no-cache'
    });
    reponse.end(contenu);
  });
}).listen(PORT, () => {
  console.log('Arcade Rétro : http://localhost:' + PORT);
});
