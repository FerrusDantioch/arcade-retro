/* =========================================================================
   OMNI-ARCADE — service worker
   -------------------------------------------------------------------------
   Un service worker est un petit programme que le navigateur garde en
   memoire, a cote de la page. Son role ici est simple : conserver une copie
   de tous les fichiers de l'application pour qu'elle fonctionne meme sans
   connexion Internet.

   Pour publier une nouvelle version, il suffit de changer le numero de
   version ci-dessous : l'ancien cache sera automatiquement supprime.
   ========================================================================= */

const VERSION = 'omni-arcade-v8';

/* Débuts de nom de NOS caches (« arcade-retro- » : ancien nom de
   l'application). Toutes les applications de ferrusdantioch.github.io
   partagent la même liste de caches : on ne supprime que les nôtres. */
const PREFIXES_A_NOUS = ['omni-arcade-', 'arcade-retro-'];

/* Liste de tout ce qui doit etre disponible hors ligne. */
const FICHIERS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

/* --- 1. Installation : on met tous les fichiers en cache ---------------- */
self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches.open(VERSION)
      /* { cache: 'reload' } : chaque fichier est repris sur le serveur, sans
         passer par le petit cache du navigateur (GitHub Pages le garde
         10 minutes). Sinon, deux mises a jour publiees coup sur coup
         pourraient ranger d'anciens fichiers sous la nouvelle version. */
      .then((cache) => cache.addAll(FICHIERS.map((f) => new Request(f, { cache: 'reload' }))))
      /* La nouvelle version prend la main sans attendre la fermeture des onglets. */
      .then(() => self.skipWaiting())
  );
});

/* --- 2. Activation : on efface NOS caches des versions precedentes ------ */
self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(
        noms.filter((nom) => nom !== VERSION && PREFIXES_A_NOUS.some((p) => nom.startsWith(p))).map((nom) => caches.delete(nom))
      ))
      .then(() => self.clients.claim())
  );
});

/* --- 3. Interception des requetes --------------------------------------
   Strategie « cache d'abord » : on repond immediatement avec la copie
   locale si elle existe, sinon on va la chercher sur le reseau et on la
   garde pour la prochaine fois.
   ----------------------------------------------------------------------- */
self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;

  /* On ne s'occupe que des lectures de nos propres fichiers. */
  if (requete.method !== 'GET') return;
  if (new URL(requete.url).origin !== self.location.origin) return;

  evenement.respondWith(
    caches.match(requete, { ignoreSearch: true }).then((copieLocale) => {
      if (copieLocale) return copieLocale;

      return fetch(requete)
        .then((reponseReseau) => {
          /* On ne met en cache que les reponses valides de notre site. */
          if (reponseReseau && reponseReseau.ok && reponseReseau.type === 'basic') {
            const aGarder = reponseReseau.clone();
            caches.open(VERSION).then((cache) => cache.put(requete, aGarder));
          }
          return reponseReseau;
        })
        .catch(() => {
          /* Hors ligne et fichier inconnu : pour une navigation, on renvoie
             la page d'accueil, qui est toujours en cache. */
          if (requete.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 503, statusText: 'Hors ligne' });
        });
    })
  );
});
