/* =========================================================================
   ARCADE RETRO — logique de l'application
   -------------------------------------------------------------------------
   Ce fichier contient TOUT le code de l'application :
     1. de petites fonctions utilitaires
     2. les sons (fabriques par le navigateur, aucun fichier audio)
     3. la sauvegarde des scores dans le navigateur (localStorage)
     4. la navigation entre les ecrans
     5. la lecture des touches du clavier et des boutons tactiles
     6. le "moteur" commun aux trois jeux (la boucle d'animation)
     7. les trois jeux
     8. le menu, le tableau des scores et l'installation de l'application

   Le code est volontairement decoupe en petits blocs commentes.
   ========================================================================= */

'use strict';

/* =========================================================================
   1. PETITES FONCTIONS UTILITAIRES
   ========================================================================= */

/** Raccourci : recupere le premier element correspondant au selecteur CSS. */
function $(selecteur) {
  return document.querySelector(selecteur);
}

/** Renvoie un nombre entier au hasard entre min et max (inclus). */
function hasard(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Force une valeur a rester entre un minimum et un maximum. */
function limiter(valeur, min, max) {
  return Math.max(min, Math.min(max, valeur));
}

/** Transforme une date en texte court, par exemple "09/09/2026". */
function dateCourte(texteIso) {
  const d = new Date(texteIso);
  if (isNaN(d)) return '';
  const deuxChiffres = (n) => String(n).padStart(2, '0');
  return deuxChiffres(d.getDate()) + '/' + deuxChiffres(d.getMonth() + 1) + '/' + d.getFullYear();
}

/** Empeche l'injection de code : on n'affiche jamais de HTML venant du joueur. */
function texteSur(element, texte) {
  element.textContent = texte;
}

/* =========================================================================
   2. LES SONS
   -------------------------------------------------------------------------
   Aucun fichier audio n'est telecharge : le navigateur fabrique lui-meme
   les bips grace a l'API Web Audio. Un oscillateur = une note.
   ========================================================================= */

const Sons = {
  actif: true,
  contexte: null,

  /** Cree le "contexte audio" au premier clic du joueur (regle des navigateurs). */
  reveiller() {
    if (this.contexte) {
      if (this.contexte.state === 'suspended') this.contexte.resume();
      return;
    }
    const Fabrique = window.AudioContext || window.webkitAudioContext;
    if (!Fabrique) return;                 // navigateur sans son : on ignore
    try { this.contexte = new Fabrique(); } catch (e) { this.contexte = null; }
  },

  /** Joue une note simple. depart = decalage en secondes par rapport a maintenant. */
  note(frequence, duree, forme, volume, depart) {
    if (!this.actif || !this.contexte) return;
    const t0 = this.contexte.currentTime + (depart || 0);
    const oscillateur = this.contexte.createOscillator();
    const gain = this.contexte.createGain();
    oscillateur.type = forme || 'square';
    oscillateur.frequency.setValueAtTime(frequence, t0);
    // Le volume descend jusqu'a zero : cela evite les "clics" desagreables.
    gain.gain.setValueAtTime(volume || 0.05, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duree);
    oscillateur.connect(gain).connect(this.contexte.destination);
    oscillateur.start(t0);
    oscillateur.stop(t0 + duree + 0.02);
  },

  /** Joue un effet sonore identifie par son nom. */
  effet(nom) {
    if (!this.actif || !this.contexte) return;
    switch (nom) {
      case 'deplacer':  this.note(180, 0.05, 'square', 0.03, 0); break;
      case 'tourner':   this.note(330, 0.06, 'square', 0.04, 0); break;
      case 'poser':     this.note(120, 0.09, 'triangle', 0.05, 0); break;
      case 'ligne':
        this.note(523, 0.08, 'square', 0.05, 0);
        this.note(659, 0.08, 'square', 0.05, 0.07);
        this.note(784, 0.14, 'square', 0.05, 0.14);
        break;
      case 'manger':
        this.note(660, 0.06, 'square', 0.05, 0);
        this.note(880, 0.08, 'square', 0.05, 0.05);
        break;
      case 'tir':       this.note(720, 0.06, 'sawtooth', 0.03, 0); break;
      case 'explosion':
        this.note(160, 0.16, 'sawtooth', 0.05, 0);
        this.note(90,  0.20, 'square', 0.04, 0.04);
        break;
      case 'degat':     this.note(110, 0.25, 'sawtooth', 0.06, 0); break;
      case 'vague':
        this.note(392, 0.10, 'triangle', 0.05, 0);
        this.note(523, 0.10, 'triangle', 0.05, 0.10);
        this.note(659, 0.18, 'triangle', 0.05, 0.20);
        break;
      case 'fin':
        this.note(392, 0.14, 'square', 0.05, 0);
        this.note(311, 0.14, 'square', 0.05, 0.15);
        this.note(233, 0.30, 'square', 0.05, 0.30);
        break;
    }
  },

  /** Active ou coupe le son, et retient le choix du joueur. */
  basculer() {
    this.actif = !this.actif;
    try { localStorage.setItem('arcade-retro.son', this.actif ? '1' : '0'); } catch (e) { /* ignore */ }
    return this.actif;
  },

  /** Relit le choix du joueur au demarrage. */
  charger() {
    try {
      const v = localStorage.getItem('arcade-retro.son');
      if (v !== null) this.actif = (v === '1');
    } catch (e) { /* stockage indisponible : on garde le son actif */ }
  }
};

/* =========================================================================
   3. LES MEILLEURS SCORES
   -------------------------------------------------------------------------
   Tout est enregistre dans le navigateur, dans "localStorage".
   Aucun serveur n'est utilise : les scores restent sur l'appareil,
   et fonctionnent donc parfaitement hors connexion.
   Forme des donnees enregistrees :
     { "blocs": [ { pseudo: "ZOE", score: 1200, date: "2026-09-09T..." } ], ... }
   ========================================================================= */

const Scores = {
  CLE: 'arcade-retro.scores.v1',
  CLE_PSEUDO: 'arcade-retro.pseudo.v1',
  MAXIMUM: 10,                      // on ne garde que les 10 meilleurs

  /** Lit l'ensemble des scores. Renvoie toujours un objet, meme en cas de souci. */
  tout() {
    try {
      const brut = localStorage.getItem(this.CLE);
      const donnees = brut ? JSON.parse(brut) : {};
      return (donnees && typeof donnees === 'object') ? donnees : {};
    } catch (e) {
      return {};                    // stockage bloque ou donnees abimees
    }
  },

  /** Enregistre l'ensemble des scores. */
  enregistrer(donnees) {
    try {
      localStorage.setItem(this.CLE, JSON.stringify(donnees));
      return true;
    } catch (e) {
      return false;                 // navigation privee, quota plein…
    }
  },

  /** Liste des scores d'un jeu, deja triee du meilleur au moins bon. */
  liste(idJeu) {
    const tableau = this.tout()[idJeu];
    if (!Array.isArray(tableau)) return [];
    return tableau
      .filter((e) => e && typeof e.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, this.MAXIMUM);
  },

  /** Meilleur score d'un jeu (0 si aucune partie jouee). */
  meilleur(idJeu) {
    const l = this.liste(idJeu);
    return l.length ? l[0].score : 0;
  },

  /**
   * Ajoute un score et renvoie son rang dans le top 10 (0 = premier),
   * ou -1 si le score n'est pas assez bon pour entrer dans le classement.
   */
  ajouter(idJeu, pseudo, score) {
    const donnees = this.tout();
    const liste = Array.isArray(donnees[idJeu]) ? donnees[idJeu] : [];
    const entree = { pseudo: pseudo, score: score, date: new Date().toISOString() };
    liste.push(entree);
    liste.sort((a, b) => b.score - a.score);
    donnees[idJeu] = liste.slice(0, this.MAXIMUM);
    this.enregistrer(donnees);
    return donnees[idJeu].indexOf(entree);
  },

  /** Efface les scores d'un seul jeu. */
  effacer(idJeu) {
    const donnees = this.tout();
    delete donnees[idJeu];
    this.enregistrer(donnees);
  },

  /** Retient le dernier pseudo utilise, pour ne pas le retaper a chaque partie. */
  dernierPseudo() {
    try { return localStorage.getItem(this.CLE_PSEUDO) || ''; } catch (e) { return ''; }
  },
  memoriserPseudo(pseudo) {
    try { localStorage.setItem(this.CLE_PSEUDO, pseudo); } catch (e) { /* ignore */ }
  }
};

/* =========================================================================
   4. NAVIGATION ENTRE LES ECRANS
   -------------------------------------------------------------------------
   Les trois ecrans existent tous dans index.html ; un seul est visible
   a la fois, celui qui porte la classe "ecran--actif".
   ========================================================================= */

const Ecrans = {
  actuel: 'ecran-menu',

  afficher(id) {
    document.querySelectorAll('.ecran').forEach((section) => {
      section.classList.toggle('ecran--actif', section.id === id);
    });
    this.actuel = id;
  }
};

/* =========================================================================
   5. LES COMMANDES (clavier + boutons tactiles)
   -------------------------------------------------------------------------
   On traduit les touches du clavier en "actions" comprehensibles par les
   jeux : gauche, droite, haut, bas, feu, pause. Les boutons tactiles
   envoient exactement les memes actions : les jeux n'ont donc pas besoin
   de savoir si l'on joue au clavier ou au doigt.
   ========================================================================= */

/* Table de correspondance : code de la touche -> action du jeu */
const TOUCHES = {
  ArrowLeft: 'gauche',  KeyA: 'gauche',  KeyQ: 'gauche',
  ArrowRight: 'droite', KeyD: 'droite',
  ArrowUp: 'haut',      KeyW: 'haut',    KeyZ: 'haut',
  ArrowDown: 'bas',     KeyS: 'bas',
  Space: 'feu',         KeyX: 'rotation', KeyK: 'feu',
  KeyP: 'pause',        Escape: 'pause'
};

const Entrees = {
  /* Ensemble des actions maintenues enfoncees en ce moment. */
  enfoncees: new Set(),

  estEnfoncee(action) {
    return this.enfoncees.has(action);
  },

  /** Une action vient d'etre declenchee (appui). */
  presser(action) {
    this.enfoncees.add(action);
    Moteur.actionPressee(action);
  },

  /** L'action n'est plus maintenue (relachement). */
  relacher(action) {
    this.enfoncees.delete(action);
  },

  /** Vide tout : utile quand on quitte une partie ou quand on perd le focus. */
  vider() {
    this.enfoncees.clear();
  },

  /** Branche le clavier et les boutons tactiles. Appele une seule fois. */
  installer() {
    document.addEventListener('keydown', (e) => {
      const action = TOUCHES[e.code];
      if (!action) return;
      if (Ecrans.actuel !== 'ecran-jeu') return;          // hors partie : on ne touche a rien
      if (!$('#modale-pseudo').hidden) return;            // le joueur tape son pseudo
      e.preventDefault();                                 // evite de faire defiler la page
      if (e.repeat) return;                               // la repetition est geree par les jeux
      this.presser(action);
    });

    document.addEventListener('keyup', (e) => {
      const action = TOUCHES[e.code];
      if (action) this.relacher(action);
    });

    /* Si l'on change d'onglet, on relache tout pour eviter une touche "collee". */
    window.addEventListener('blur', () => this.vider());

    /* Boutons tactiles : un seul ecouteur pour tous les boutons (delegation). */
    const zone = $('#jeu-commandes');

    zone.addEventListener('pointerdown', (e) => {
      const bouton = e.target.closest('[data-action]');
      if (!bouton) return;
      e.preventDefault();
      bouton.classList.add('tactile--enfonce');
      /* On "capture" le pointeur : le relachement sera recu meme si le doigt
         glisse en dehors du bouton. */
      try { bouton.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      Sons.reveiller();
      this.presser(bouton.dataset.action);
    });

    const relachement = (e) => {
      const bouton = e.target.closest('[data-action]');
      if (!bouton) return;
      bouton.classList.remove('tactile--enfonce');
      this.relacher(bouton.dataset.action);
    };
    zone.addEventListener('pointerup', relachement);
    zone.addEventListener('pointercancel', relachement);
    /* Empeche le menu contextuel apres un appui long sur mobile. */
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }
};

/* =========================================================================
   6. LE MOTEUR DE JEU
   -------------------------------------------------------------------------
   Partie commune aux trois jeux. Il s'occupe de :
     - preparer le canvas a la bonne taille (et le redimensionner) ;
     - appeler 60 fois par seconde la mise a jour puis le dessin du jeu ;
     - gerer la pause et la fin de partie.

   Chaque jeu est un objet qui fournit :
     id, nom, description, largeur, hauteur, aide, commandes (HTML),
     init(), maj(dt), dessiner(ctx), action(nom), hud(), vignette(ctx)
   ========================================================================= */

const Moteur = {
  jeu: null,
  canvas: null,
  ctx: null,
  enPause: false,
  fini: false,
  idAnimation: 0,
  tempsPrecedent: 0,
  hudValeurs: [],
  minuteurPseudo: 0,     // minuteur qui ouvre la fenetre du pseudo

  /** Preparation unique au demarrage de l'application. */
  installer() {
    this.canvas = $('#canvas');
    this.ctx = this.canvas.getContext('2d');
    this.boucleLiee = this.boucle.bind(this);

    /* Le canvas est redimensionne des que la zone de jeu change de taille
       (rotation du telephone, redimensionnement de la fenetre…). */
    if (window.ResizeObserver) {
      new ResizeObserver(() => this.redimensionner()).observe($('#jeu-scene'));
    }
    window.addEventListener('resize', () => this.redimensionner());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.redimensionner(), 200);
    });

    /* Si l'application passe en arriere-plan, on met la partie en pause. */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.jeu && !this.fini) this.pause(true);
    });
  },

  /** Demarre (ou redemarre) un jeu. */
  demarrer(jeu) {
    this.arreterBoucle();
    this.annulerMinuteurPseudo();
    this.jeu = jeu;
    this.enPause = false;
    this.fini = false;

    texteSur($('#jeu-titre'), jeu.nom);
    texteSur($('#jeu-aide'), jeu.aide);
    $('#jeu-commandes').innerHTML = jeu.commandes;
    $('#jeu-voile').hidden = true;

    Entrees.vider();
    jeu.init();                       // chaque jeu remet ses variables a zero
    this.construireHud();

    Ecrans.afficher('ecran-jeu');     // affiche l'ecran AVANT de mesurer la place
    this.redimensionner();

    this.tempsPrecedent = performance.now();
    this.idAnimation = requestAnimationFrame(this.boucleLiee);
  },

  /**
   * Calcule la plus grande taille d'affichage possible du canvas tout en
   * conservant ses proportions, puis adapte sa definition a la finesse de
   * l'ecran (devicePixelRatio) pour un rendu bien net.
   */
  redimensionner() {
    if (!this.jeu) return;
    const scene = $('#jeu-scene');
    const dispoLargeur = scene.clientWidth - 12;
    const dispoHauteur = scene.clientHeight - 12;
    if (dispoLargeur <= 0 || dispoHauteur <= 0) return;

    const echelle = Math.min(dispoLargeur / this.jeu.largeur, dispoHauteur / this.jeu.hauteur);
    const largeurCss = Math.max(80, Math.floor(this.jeu.largeur * echelle));
    const hauteurCss = Math.max(80, Math.floor(this.jeu.hauteur * echelle));

    this.canvas.style.width = largeurCss + 'px';
    this.canvas.style.height = hauteurCss + 'px';

    const finesse = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(largeurCss * finesse);
    this.canvas.height = Math.round(hauteurCss * finesse);

    /* On travaille toujours dans les coordonnees "logiques" du jeu :
       une seule mise a l'echelle ici, et les jeux dessinent simplement. */
    const facteur = this.canvas.width / this.jeu.largeur;
    this.ctx.setTransform(facteur, 0, 0, facteur, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  },

  /** Construit les cases du tableau de bord (score, niveau…). */
  construireHud() {
    const zone = $('#jeu-hud');
    zone.innerHTML = '';
    this.hudValeurs = [];
    this.jeu.hud().forEach((bloc) => {
      const boite = document.createElement('div');
      boite.className = 'hud__bloc';
      const label = document.createElement('span');
      label.className = 'hud__label';
      label.textContent = bloc.label;
      const valeur = document.createElement('span');
      valeur.className = 'hud__valeur';
      valeur.textContent = bloc.valeur;
      boite.append(label, valeur);
      zone.append(boite);
      this.hudValeurs.push(valeur);
    });
  },

  /** Met a jour les chiffres du tableau de bord (uniquement s'ils ont change). */
  majHud() {
    const blocs = this.jeu.hud();
    for (let i = 0; i < blocs.length && i < this.hudValeurs.length; i++) {
      const texte = String(blocs[i].valeur);
      if (this.hudValeurs[i].textContent !== texte) this.hudValeurs[i].textContent = texte;
    }
  },

  /**
   * La boucle principale : appelee automatiquement a chaque image (~60 par
   * seconde). "dt" est le temps ecoule depuis l'image precedente, en secondes.
   */
  boucle(temps) {
    this.idAnimation = requestAnimationFrame(this.boucleLiee);

    let dt = (temps - this.tempsPrecedent) / 1000;
    this.tempsPrecedent = temps;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.1);          // securite apres un long arret (onglet cache)

    if (!this.enPause && !this.fini) {
      this.jeu.maj(dt);
      this.majHud();
    }
    this.ctx.clearRect(0, 0, this.jeu.largeur, this.jeu.hauteur);
    this.jeu.dessiner(this.ctx);
  },

  arreterBoucle() {
    if (this.idAnimation) cancelAnimationFrame(this.idAnimation);
    this.idAnimation = 0;
  },

  /** Recoit les appuis (clavier ou tactile) et les transmet au jeu. */
  actionPressee(action) {
    if (!this.jeu || this.fini) return;
    if (action === 'pause') { this.pause(!this.enPause); return; }
    if (this.enPause) return;
    if (this.jeu.action) this.jeu.action(action);
  },

  /** Met en pause ou reprend la partie. */
  pause(valeur) {
    if (!this.jeu || this.fini) return;
    this.enPause = valeur;
    Entrees.vider();
    if (this.enPause) {
      this.afficherVoile('Pause', 'La partie est arretee.', { reprendre: true, rejouer: false });
    } else {
      $('#jeu-voile').hidden = true;
      this.tempsPrecedent = performance.now();   // evite un saut de temps
    }
  },

  /** Affiche le voile par-dessus le jeu. */
  afficherVoile(titre, texte, boutons) {
    texteSur($('#voile-titre'), titre);
    texteSur($('#voile-texte'), texte);
    $('#btn-reprendre').hidden = !boutons.reprendre;
    $('#btn-rejouer').hidden = !boutons.rejouer;
    $('#jeu-voile').hidden = false;
  },

  /** Fin de partie : on fige le jeu et on propose d'enregistrer le score. */
  terminer(score) {
    if (this.fini) return;
    this.fini = true;
    Entrees.vider();
    Sons.effet('fin');
    this.afficherVoile('Partie terminée', score + ' points', { reprendre: false, rejouer: true });
    /* Petit delai : le joueur voit d'abord son ecran de fin. On retient
       l'identifiant tout de suite, au cas ou il quitterait entre-temps. */
    const idJeu = this.jeu.id;
    this.annulerMinuteurPseudo();
    this.minuteurPseudo = setTimeout(() => {
      this.minuteurPseudo = 0;
      ModalePseudo.ouvrir(idJeu, score);
    }, 550);
  },

  /** Annule l'ouverture programmee de la fenetre du pseudo. */
  annulerMinuteurPseudo() {
    if (this.minuteurPseudo) clearTimeout(this.minuteurPseudo);
    this.minuteurPseudo = 0;
  },

  /** Quitte la partie en cours et revient au menu. */
  quitter() {
    this.arreterBoucle();
    this.annulerMinuteurPseudo();
    ModalePseudo.fermer();
    this.fini = true;
    this.jeu = null;
    Entrees.vider();
    $('#jeu-voile').hidden = true;
    Ecrans.afficher('ecran-menu');
    construireMenu();
  }
};

/* =========================================================================
   7. OUTILS DE DESSIN PARTAGES PAR LES TROIS JEUX
   -------------------------------------------------------------------------
   Tous les graphismes sont dessines a la main dans le canvas : il n'y a
   aucune image a telecharger, donc rien qui puisse manquer hors ligne.
   ========================================================================= */

/** Dessine une case pleine avec un relief simple (style pixel). */
function caseRelief(ctx, x, y, taille, couleur) {
  ctx.fillStyle = couleur;
  ctx.fillRect(x, y, taille, taille);
  /* Bord clair en haut a gauche */
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(x, y, taille, 2);
  ctx.fillRect(x, y, 2, taille);
  /* Bord sombre en bas a droite */
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(x, y + taille - 2, taille, 2);
  ctx.fillRect(x + taille - 2, y, 2, taille);
}

/**
 * Dessine un petit motif "pixel art" decrit par un tableau de chaines.
 * Chaque caractere different de "." devient un carre de la taille demandee.
 * Exemple : ['.X.', 'XXX'] dessine une petite fleche.
 */
function dessinerMotif(ctx, motif, x, y, taille, couleur) {
  ctx.fillStyle = couleur;
  for (let ligne = 0; ligne < motif.length; ligne++) {
    const texte = motif[ligne];
    for (let colonne = 0; colonne < texte.length; colonne++) {
      if (texte[colonne] !== '.') {
        ctx.fillRect(x + colonne * taille, y + ligne * taille, taille, taille);
      }
    }
  }
}

/** Ecrit un texte centre horizontalement sur la position x. */
function texteCentre(ctx, texte, x, y, taillePolice, couleur) {
  ctx.fillStyle = couleur;
  ctx.font = 'bold ' + taillePolice + 'px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texte, x, y);
}

/* =========================================================================
   8. JEU 1 — CHUTE DE BLOCS
   -------------------------------------------------------------------------
   Des pieces geometriques tombent dans une grille de 10 colonnes sur 20
   rangees. Quand une rangee est entierement remplie, elle disparait et
   rapporte des points. Plus on complete de lignes, plus la chute accelere.
   ========================================================================= */

const B_COLONNES = 10;    // largeur de la grille, en cases
const B_RANGEES  = 20;    // hauteur de la grille, en cases
const B_CASE     = 24;    // taille d'une case, en pixels
const B_PANNEAU  = 88;    // largeur du panneau lateral "piece suivante"

/* Les sept pieces classiques, decrites par une petite matrice.
   1 = case pleine, 0 = case vide. La matrice est carree afin que la
   rotation soit facile a calculer. */
const B_PIECES = [
  { nom: 'I', couleur: '#38e8ff', cases: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
  { nom: 'O', couleur: '#ffd23f', cases: [[1,1],[1,1]] },
  { nom: 'T', couleur: '#c77dff', cases: [[0,1,0],[1,1,1],[0,0,0]] },
  { nom: 'S', couleur: '#4ef08a', cases: [[0,1,1],[1,1,0],[0,0,0]] },
  { nom: 'Z', couleur: '#ff4d6d', cases: [[1,1,0],[0,1,1],[0,0,0]] },
  { nom: 'J', couleur: '#4d79ff', cases: [[1,0,0],[1,1,1],[0,0,0]] },
  { nom: 'L', couleur: '#ff9f1c', cases: [[0,0,1],[1,1,1],[0,0,0]] }
];

/** Fait tourner une matrice d'un quart de tour dans le sens des aiguilles. */
function tournerMatrice(matrice) {
  const n = matrice.length;
  const resultat = [];
  for (let y = 0; y < n; y++) {
    resultat.push([]);
    for (let x = 0; x < n; x++) {
      resultat[y].push(matrice[n - 1 - x][y]);
    }
  }
  return resultat;
}

const jeuBlocs = {
  id: 'blocs',
  nom: 'Chute de Blocs',
  description: 'Empilez les pièces et complétez des lignes entières.',
  largeur: B_COLONNES * B_CASE + B_PANNEAU,
  hauteur: B_RANGEES * B_CASE,
  aide: 'Flèches ◀ ▶ : déplacer · ▲ ou X : tourner · ▼ : descendre · Espace : chute immédiate · P : pause',
  commandes:
    '<div class="commandes__groupe">' +
      '<button class="tactile" data-action="gauche" aria-label="Aller à gauche">◀</button>' +
      '<button class="tactile" data-action="droite" aria-label="Aller à droite">▶</button>' +
    '</div>' +
    '<div class="commandes__groupe">' +
      '<button class="tactile" data-action="bas" aria-label="Descendre">▼</button>' +
      '<button class="tactile" data-action="haut" aria-label="Tourner la pièce">⟳</button>' +
      '<button class="tactile tactile--feu" data-action="feu" aria-label="Chute immédiate">⤓</button>' +
    '</div>',

  /* --- Preparation d'une nouvelle partie --- */
  init() {
    /* La grille contient soit null (case vide) soit une couleur. */
    this.grille = [];
    for (let y = 0; y < B_RANGEES; y++) {
      this.grille.push(new Array(B_COLONNES).fill(null));
    }
    this.sac = [];                 // pioche melangee des sept pieces
    this.piece = null;
    this.suivante = this.piocher();
    this.score = 0;
    this.lignes = 0;
    this.niveau = 1;
    this.chuteAccumulee = 0;
    this.directionMaintenue = null;
    this.delaiRepetition = 0;
    this.nouvellePiece();
  },

  /** Vitesse de chute (en secondes par case) : elle diminue avec le niveau. */
  delaiChute() {
    return Math.max(0.09, 0.8 - (this.niveau - 1) * 0.065);
  },

  /** Pioche une piece dans un sac de 7 pieces melangees (repartition equitable). */
  piocher() {
    if (this.sac.length === 0) {
      this.sac = B_PIECES.slice();
      for (let i = this.sac.length - 1; i > 0; i--) {   // melange du sac
        const j = hasard(0, i);
        const t = this.sac[i]; this.sac[i] = this.sac[j]; this.sac[j] = t;
      }
    }
    const modele = this.sac.pop();
    return { couleur: modele.couleur, cases: modele.cases.map((l) => l.slice()) };
  },

  /** Fait entrer la piece suivante en haut de la grille. */
  nouvellePiece() {
    this.piece = this.suivante;
    this.suivante = this.piocher();
    this.piece.x = Math.floor((B_COLONNES - this.piece.cases.length) / 2);
    this.piece.y = 0;
    /* Si la nouvelle piece ne rentre deja plus, la partie est terminee. */
    if (this.collision(this.piece.cases, this.piece.x, this.piece.y)) {
      Moteur.terminer(this.score);
    }
  },

  /** Verifie si une piece placee en (px, py) touche un mur ou un bloc pose. */
  collision(cases, px, py) {
    for (let y = 0; y < cases.length; y++) {
      for (let x = 0; x < cases[y].length; x++) {
        if (!cases[y][x]) continue;
        const gx = px + x;
        const gy = py + y;
        if (gx < 0 || gx >= B_COLONNES || gy >= B_RANGEES) return true;
        if (gy >= 0 && this.grille[gy][gx]) return true;
      }
    }
    return false;
  },

  /** Deplace la piece horizontalement si la place est libre. */
  deplacer(pas) {
    if (!this.collision(this.piece.cases, this.piece.x + pas, this.piece.y)) {
      this.piece.x += pas;
      Sons.effet('deplacer');
      return true;
    }
    return false;
  },

  /** Tourne la piece ; si elle ne rentre pas, on essaie de la decaler un peu. */
  tourner() {
    const tournee = tournerMatrice(this.piece.cases);
    const decalages = [0, -1, 1, -2, 2];      // rattrapages contre les murs
    for (const d of decalages) {
      if (!this.collision(tournee, this.piece.x + d, this.piece.y)) {
        this.piece.cases = tournee;
        this.piece.x += d;
        Sons.effet('tourner');
        return;
      }
    }
  },

  /** Descend la piece d'une case. Renvoie false si elle vient d'etre posee. */
  descendre() {
    if (!this.collision(this.piece.cases, this.piece.x, this.piece.y + 1)) {
      this.piece.y += 1;
      return true;
    }
    this.poser();
    return false;
  },

  /** Chute immediate jusqu'en bas. */
  chuteRapide() {
    let distance = 0;
    while (!this.collision(this.piece.cases, this.piece.x, this.piece.y + 1)) {
      this.piece.y += 1;
      distance++;
    }
    this.score += distance * 2;               // la chute rapide rapporte des points
    this.poser();
  },

  /** Fixe la piece dans la grille puis verifie les lignes completes. */
  poser() {
    const p = this.piece;
    for (let y = 0; y < p.cases.length; y++) {
      for (let x = 0; x < p.cases[y].length; x++) {
        if (p.cases[y][x] && p.y + y >= 0) {
          this.grille[p.y + y][p.x + x] = p.couleur;
        }
      }
    }
    Sons.effet('poser');
    this.nettoyerLignes();
    this.chuteAccumulee = 0;
    this.nouvellePiece();
  },

  /** Supprime les rangees pleines et compte les points. */
  nettoyerLignes() {
    let completes = 0;
    for (let y = B_RANGEES - 1; y >= 0; y--) {
      if (this.grille[y].every((c) => c !== null)) {
        this.grille.splice(y, 1);                              // on retire la ligne
        this.grille.unshift(new Array(B_COLONNES).fill(null)); // on en ajoute une vide en haut
        completes++;
        y++;                                                   // on reexamine la meme hauteur
      }
    }
    if (completes > 0) {
      const bareme = [0, 100, 300, 500, 800];   // 1, 2, 3 ou 4 lignes d'un coup
      this.score += bareme[completes] * this.niveau;
      this.lignes += completes;
      this.niveau = Math.floor(this.lignes / 10) + 1;
      Sons.effet('ligne');
    }
  },

  /* --- Reaction aux commandes --- */
  action(nom) {
    if (nom === 'gauche' || nom === 'droite') {
      this.deplacer(nom === 'gauche' ? -1 : 1);
      this.directionMaintenue = nom;
      this.delaiRepetition = 0.17;            // pause avant la repetition automatique
    } else if (nom === 'haut' || nom === 'rotation') {
      this.tourner();
    } else if (nom === 'bas') {
      this.descendre();
      this.chuteAccumulee = 0;
    } else if (nom === 'feu') {
      this.chuteRapide();
    }
  },

  /* --- Mise a jour, appelee a chaque image --- */
  maj(dt) {
    /* Repetition automatique quand on garde une direction enfoncee. */
    if (this.directionMaintenue && !Entrees.estEnfoncee(this.directionMaintenue)) {
      this.directionMaintenue = null;
    }
    if (!this.directionMaintenue) {
      if (Entrees.estEnfoncee('gauche')) { this.directionMaintenue = 'gauche'; this.delaiRepetition = 0.17; }
      else if (Entrees.estEnfoncee('droite')) { this.directionMaintenue = 'droite'; this.delaiRepetition = 0.17; }
    }
    if (this.directionMaintenue) {
      this.delaiRepetition -= dt;
      while (this.delaiRepetition <= 0) {
        this.deplacer(this.directionMaintenue === 'gauche' ? -1 : 1);
        this.delaiRepetition += 0.05;
      }
    }

    /* Chute automatique (plus rapide si la touche bas est maintenue). */
    const descenteRapide = Entrees.estEnfoncee('bas');
    const delai = descenteRapide ? 0.04 : this.delaiChute();
    this.chuteAccumulee += dt;
    while (this.chuteAccumulee >= delai) {
      this.chuteAccumulee -= delai;
      const aDescendu = this.descendre();
      if (aDescendu && descenteRapide) this.score += 1;
      if (!aDescendu) break;                  // la piece vient d'etre posee
    }
  },

  hud() {
    return [
      { label: 'SCORE',  valeur: this.score },
      { label: 'NIVEAU', valeur: this.niveau },
      { label: 'LIGNES', valeur: this.lignes }
    ];
  },

  /* --- Dessin --- */
  dessiner(ctx) {
    const largeurGrille = B_COLONNES * B_CASE;

    /* Fond de la grille et quadrillage discret */
    ctx.fillStyle = '#0a0819';
    ctx.fillRect(0, 0, largeurGrille, this.hauteur);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 1; x < B_COLONNES; x++) {
      ctx.beginPath();
      ctx.moveTo(x * B_CASE + 0.5, 0);
      ctx.lineTo(x * B_CASE + 0.5, this.hauteur);
      ctx.stroke();
    }
    for (let y = 1; y < B_RANGEES; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * B_CASE + 0.5);
      ctx.lineTo(largeurGrille, y * B_CASE + 0.5);
      ctx.stroke();
    }

    /* Blocs deja poses */
    for (let y = 0; y < B_RANGEES; y++) {
      for (let x = 0; x < B_COLONNES; x++) {
        if (this.grille[y][x]) {
          caseRelief(ctx, x * B_CASE, y * B_CASE, B_CASE, this.grille[y][x]);
        }
      }
    }

    if (this.piece) {
      /* Ombre indiquant ou la piece va atterrir : une aide bien pratique. */
      let ombreY = this.piece.y;
      while (!this.collision(this.piece.cases, this.piece.x, ombreY + 1)) ombreY++;
      const decalage = ombreY - this.piece.y;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 2;
      this.parcourirPiece(this.piece, (gx, gy) => {
        ctx.strokeRect(gx * B_CASE + 1, (gy + decalage) * B_CASE + 1, B_CASE - 2, B_CASE - 2);
      });

      /* La piece en train de tomber */
      this.parcourirPiece(this.piece, (gx, gy) => {
        if (gy >= 0) caseRelief(ctx, gx * B_CASE, gy * B_CASE, B_CASE, this.piece.couleur);
      });
    }

    /* Panneau lateral : la piece suivante */
    ctx.fillStyle = '#12102a';
    ctx.fillRect(largeurGrille, 0, B_PANNEAU, this.hauteur);
    ctx.fillStyle = '#241d52';
    ctx.fillRect(largeurGrille, 0, 2, this.hauteur);

    const centreX = largeurGrille + B_PANNEAU / 2;
    texteCentre(ctx, 'SUIVANT', centreX, 24, 11, '#9d97cf');

    const s = this.suivante;
    const taille = 16;
    const largeurPiece = s.cases[0].length * taille;
    const originX = centreX - largeurPiece / 2;
    const originY = 44;
    for (let y = 0; y < s.cases.length; y++) {
      for (let x = 0; x < s.cases[y].length; x++) {
        if (s.cases[y][x]) {
          caseRelief(ctx, originX + x * taille, originY + y * taille, taille, s.couleur);
        }
      }
    }

    texteCentre(ctx, 'NIVEAU', centreX, 160, 11, '#9d97cf');
    texteCentre(ctx, String(this.niveau), centreX, 182, 22, '#ffd23f');
    texteCentre(ctx, 'RECORD', centreX, 226, 11, '#9d97cf');
    texteCentre(ctx, String(Scores.meilleur('blocs')), centreX, 246, 14, '#4ef08a');
  },

  /** Appelle une fonction pour chaque case pleine de la piece (coordonnees grille). */
  parcourirPiece(piece, fonction) {
    for (let y = 0; y < piece.cases.length; y++) {
      for (let x = 0; x < piece.cases[y].length; x++) {
        if (piece.cases[y][x]) fonction(piece.x + x, piece.y + y);
      }
    }
  },

  /** Petite image affichee dans le menu (canvas de 64 x 64 pixels). */
  vignette(ctx) {
    ctx.fillStyle = '#0a0819';
    ctx.fillRect(0, 0, 64, 64);
    caseRelief(ctx,  8,  8, 14, '#38e8ff');
    caseRelief(ctx, 22,  8, 14, '#38e8ff');
    caseRelief(ctx, 36,  8, 14, '#38e8ff');
    caseRelief(ctx, 36, 22, 14, '#ff9f1c');
    caseRelief(ctx,  8, 36, 14, '#c77dff');
    caseRelief(ctx, 22, 36, 14, '#c77dff');
    caseRelief(ctx, 36, 36, 14, '#c77dff');
    caseRelief(ctx, 22, 50, 14, '#ffd23f');
  }
};

/* =========================================================================
   9. JEU 2 — LE SERPENT VORACE
   -------------------------------------------------------------------------
   Un serpent avance case par case sur une grille. Il grandit chaque fois
   qu'il attrape une pastille. La partie s'arrete s'il sort de la grille
   ou s'il se mord la queue.
   ========================================================================= */

const S_COLONNES = 20;
const S_RANGEES  = 20;
const S_CASE     = 20;

/** Melange deux couleurs (utilise pour le degrade du corps du serpent). */
function melangerCouleurs(couleurA, couleurB, proportion) {
  const lire = (c) => [
    parseInt(c.substr(1, 2), 16),
    parseInt(c.substr(3, 2), 16),
    parseInt(c.substr(5, 2), 16)
  ];
  const a = lire(couleurA);
  const b = lire(couleurB);
  const m = a.map((valeur, i) => Math.round(valeur + (b[i] - valeur) * proportion));
  return 'rgb(' + m[0] + ',' + m[1] + ',' + m[2] + ')';
}

const jeuSerpent = {
  id: 'serpent',
  nom: 'Serpent Vorace',
  description: 'Attrapez les pastilles sans vous mordre la queue.',
  largeur: S_COLONNES * S_CASE,
  hauteur: S_RANGEES * S_CASE,
  aide: 'Flèches ou Z Q S D : diriger le serpent · glissez le doigt sur le jeu · P : pause',
  commandes:
    '<div class="dpad">' +
      '<button class="tactile dpad__haut" data-action="haut" aria-label="Haut">▲</button>' +
      '<button class="tactile dpad__gauche" data-action="gauche" aria-label="Gauche">◀</button>' +
      '<button class="tactile dpad__bas" data-action="bas" aria-label="Bas">▼</button>' +
      '<button class="tactile dpad__droite" data-action="droite" aria-label="Droite">▶</button>' +
    '</div>',

  init() {
    /* Le corps est une liste de cases ; la premiere case est la tete. */
    const milieu = Math.floor(S_RANGEES / 2);
    this.corps = [
      { x: 5, y: milieu },
      { x: 4, y: milieu },
      { x: 3, y: milieu }
    ];
    this.direction = { x: 1, y: 0 };     // on part vers la droite
    this.fileDirections = [];            // directions demandees, traitees une par pas
    this.aGrandir = 0;                   // nombre de cases a ajouter
    this.score = 0;
    this.mangees = 0;
    this.accumulateur = 0;
    this.animation = 0;                  // sert a faire clignoter la pastille
    this.placerNourriture();
  },

  /** Duree entre deux pas, en secondes : le serpent accelere en mangeant. */
  intervalle() {
    return Math.max(0.07, 0.16 - this.mangees * 0.004);
  },

  /** Niveau de vitesse affiche au joueur (de 1 a 10). */
  niveau() {
    return Math.min(10, 1 + Math.floor(this.mangees / 4));
  },

  /** Place une pastille sur une case libre choisie au hasard. */
  placerNourriture() {
    const libres = [];
    for (let y = 0; y < S_RANGEES; y++) {
      for (let x = 0; x < S_COLONNES; x++) {
        if (!this.corps.some((c) => c.x === x && c.y === y)) libres.push({ x: x, y: y });
      }
    }
    if (libres.length === 0) {           // grille entierement remplie : victoire !
      Moteur.terminer(this.score);
      return;
    }
    this.nourriture = libres[hasard(0, libres.length - 1)];
  },

  /* --- Reaction aux commandes --- */
  action(nom) {
    const directions = {
      gauche: { x: -1, y: 0 },
      droite: { x: 1, y: 0 },
      haut:   { x: 0, y: -1 },
      bas:    { x: 0, y: 1 }
    };
    const voulue = directions[nom];
    if (!voulue) return;

    /* On compare a la derniere direction demandee pour ne pas faire
       demi-tour sur place (ce qui reviendrait a se mordre aussitot). */
    const derniere = this.fileDirections.length
      ? this.fileDirections[this.fileDirections.length - 1]
      : this.direction;
    if (voulue.x === -derniere.x && voulue.y === -derniere.y) return;
    if (voulue.x === derniere.x && voulue.y === derniere.y) return;
    if (this.fileDirections.length < 2) this.fileDirections.push(voulue);
  },

  maj(dt) {
    this.animation += dt;
    this.accumulateur += dt;
    const pas = this.intervalle();
    while (this.accumulateur >= pas) {
      this.accumulateur -= pas;
      this.avancer();
      if (Moteur.fini) return;
    }
  },

  /** Fait avancer le serpent d'une case. */
  avancer() {
    if (this.fileDirections.length) this.direction = this.fileDirections.shift();

    const tete = {
      x: this.corps[0].x + this.direction.x,
      y: this.corps[0].y + this.direction.y
    };

    /* Sortie de la grille ? */
    if (tete.x < 0 || tete.x >= S_COLONNES || tete.y < 0 || tete.y >= S_RANGEES) {
      Sons.effet('degat');
      Moteur.terminer(this.score);
      return;
    }
    /* Le serpent se mord ? (la derniere case va disparaitre, on l'ignore) */
    const corpsTeste = this.aGrandir > 0 ? this.corps : this.corps.slice(0, -1);
    if (corpsTeste.some((c) => c.x === tete.x && c.y === tete.y)) {
      Sons.effet('degat');
      Moteur.terminer(this.score);
      return;
    }

    this.corps.unshift(tete);

    if (this.nourriture && tete.x === this.nourriture.x && tete.y === this.nourriture.y) {
      this.mangees += 1;
      this.score += 10 + this.niveau();   // plus on va vite, plus la pastille rapporte
      this.aGrandir += 2;
      Sons.effet('manger');
      this.placerNourriture();
    }

    if (this.aGrandir > 0) this.aGrandir -= 1;
    else this.corps.pop();
  },

  hud() {
    return [
      { label: 'SCORE',    valeur: this.score },
      { label: 'LONGUEUR', valeur: this.corps.length },
      { label: 'VITESSE',  valeur: this.niveau() }
    ];
  },

  dessiner(ctx) {
    /* Fond damier tres discret, pour bien voir les cases */
    ctx.fillStyle = '#0a0819';
    ctx.fillRect(0, 0, this.largeur, this.hauteur);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let y = 0; y < S_RANGEES; y++) {
      for (let x = 0; x < S_COLONNES; x++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * S_CASE, y * S_CASE, S_CASE, S_CASE);
      }
    }

    /* La pastille : un petit carre qui « respire » */
    if (this.nourriture) {
      const battement = 2 + Math.sin(this.animation * 6) * 1.5;
      const cx = this.nourriture.x * S_CASE + S_CASE / 2;
      const cy = this.nourriture.y * S_CASE + S_CASE / 2;
      const taille = S_CASE - 6 + battement;
      ctx.fillStyle = '#ff4d9d';
      ctx.fillRect(cx - taille / 2, cy - taille / 2, taille, taille);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(cx - taille / 2 + 2, cy - taille / 2 + 2, 3, 3);
    }

    /* Le corps : degrade du vert clair (tete) vers le vert sombre (queue) */
    for (let i = this.corps.length - 1; i >= 0; i--) {
      const segment = this.corps[i];
      const proportion = this.corps.length > 1 ? i / (this.corps.length - 1) : 0;
      const couleur = melangerCouleurs('#4ef08a', '#166b3c', proportion);
      const marge = i === 0 ? 1 : 2;
      ctx.fillStyle = couleur;
      ctx.fillRect(segment.x * S_CASE + marge, segment.y * S_CASE + marge,
                   S_CASE - marge * 2, S_CASE - marge * 2);
    }

    /* Deux yeux sur la tete, orientes dans le sens de la marche */
    const tete = this.corps[0];
    if (tete) {
      const baseX = tete.x * S_CASE;
      const baseY = tete.y * S_CASE;
      ctx.fillStyle = '#0a0819';
      const d = this.direction;
      /* Position des yeux : perpendiculaire a la direction */
      const decalage = 5;
      const avance = 12;
      const centreX = baseX + S_CASE / 2 + d.x * (avance - S_CASE / 2);
      const centreY = baseY + S_CASE / 2 + d.y * (avance - S_CASE / 2);
      const perpX = d.y === 0 ? 0 : decalage;
      const perpY = d.x === 0 ? 0 : decalage;
      ctx.fillRect(centreX - perpX - 1.5, centreY - perpY - 1.5, 3, 3);
      ctx.fillRect(centreX + perpX - 1.5, centreY + perpY - 1.5, 3, 3);
    }

    /* Cadre lumineux autour du terrain */
    ctx.strokeStyle = 'rgba(78, 240, 138, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, this.largeur - 2, this.hauteur - 2);
  },

  vignette(ctx) {
    ctx.fillStyle = '#0a0819';
    ctx.fillRect(0, 0, 64, 64);
    const cases = [[10, 40], [22, 40], [34, 40], [34, 28], [34, 16]];
    cases.forEach((c, i) => {
      ctx.fillStyle = melangerCouleurs('#4ef08a', '#166b3c', i / cases.length);
      ctx.fillRect(c[0], c[1], 10, 10);
    });
    ctx.fillStyle = '#ff4d9d';
    ctx.fillRect(14, 14, 8, 8);
  }
};

/**
 * Glissement du doigt sur le canvas (utile surtout pour le serpent).
 * On mesure le deplacement entre l'appui et le relachement : si le doigt
 * a parcouru plus de 24 pixels, on en deduit une direction.
 */
function installerGlissementCanvas() {
  const canvas = $('#canvas');
  let departX = 0, departY = 0, enCours = false;

  canvas.addEventListener('pointerdown', (e) => {
    departX = e.clientX;
    departY = e.clientY;
    enCours = true;
    Sons.reveiller();
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!enCours) return;
    enCours = false;
    const dx = e.clientX - departX;
    const dy = e.clientY - departY;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;   // simple tapotement
    const action = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'droite' : 'gauche')
      : (dy > 0 ? 'bas' : 'haut');
    Entrees.presser(action);
    /* Un glissement est un appui bref : on relache tout de suite. */
    setTimeout(() => Entrees.relacher(action), 60);
  });

  canvas.addEventListener('pointercancel', () => { enCours = false; });
}

/* =========================================================================
   10. JEU 3 — DEFENSE ORBITALE
   -------------------------------------------------------------------------
   Le joueur pilote un vaisseau en bas de l'ecran. Des vagues d'envahisseurs
   descendent lentement en tirant. Quatre abris protegent le vaisseau, mais
   ils se detruisent petit a petit sous les tirs.
   ========================================================================= */

const D_LARGEUR  = 360;
const D_HAUTEUR  = 480;
const D_COLONNES = 6;     // nombre d'ennemis par rangee
const D_RANGEES  = 4;     // nombre de rangees d'ennemis
const D_ECART_X  = 46;    // espacement horizontal entre deux ennemis
const D_ECART_Y  = 34;    // espacement vertical
const D_PIXEL    = 3;     // taille d'un « gros pixel » des dessins

/* Dessins des ennemis : deux especes, chacune avec deux images qui
   alternent pour donner l'illusion du mouvement. */
const D_ENNEMI_A = [
  ['..X..X..',
   '.XXXXXX.',
   'XX.XX.XX',
   'XXXXXXXX',
   '.X.XX.X.',
   'X......X'],
  ['..X..X..',
   'X.XXXX.X',
   'XXX..XXX',
   'XXXXXXXX',
   '.X.XX.X.',
   '..X..X..']
];
const D_ENNEMI_B = [
  ['...XX...',
   '..XXXX..',
   '.XXXXXX.',
   'XX.XX.XX',
   '.XX..XX.',
   'X.X..X.X'],
  ['...XX...',
   '..XXXX..',
   '.XXXXXX.',
   'XX.XX.XX',
   '..X..X..',
   '.X.XX.X.']
];
const D_VAISSEAU = [
  '....X....',
  '...XXX...',
  '.XXXXXXX.',
  'XXXXXXXXX',
  'XX.XXX.XX'
];
/* Forme d'un abri : 1 = brique presente au depart. */
const D_ABRI = [
  '..XXXX..',
  '.XXXXXX.',
  'XXXXXXXX',
  'XXX..XXX'
];

const jeuDefense = {
  id: 'defense',
  nom: 'Défense Orbitale',
  description: 'Repoussez les vagues d’envahisseurs, vague après vague.',
  largeur: D_LARGEUR,
  hauteur: D_HAUTEUR,
  aide: 'Flèches ◀ ▶ : se déplacer · Espace : tirer · P : pause',
  commandes:
    '<div class="commandes__groupe">' +
      '<button class="tactile" data-action="gauche" aria-label="Aller à gauche">◀</button>' +
      '<button class="tactile" data-action="droite" aria-label="Aller à droite">▶</button>' +
    '</div>' +
    '<div class="commandes__groupe">' +
      '<button class="tactile tactile--feu" data-action="feu" aria-label="Tirer">FEU</button>' +
    '</div>',

  init() {
    this.score = 0;
    this.vies = 3;
    this.vague = 1;
    this.joueur = { x: D_LARGEUR / 2, largeur: 27, hauteur: 15, vitesse: 215 };
    this.joueur.y = D_HAUTEUR - 34;
    this.tirsJoueur = [];
    this.tirsEnnemis = [];
    this.particules = [];
    this.invulnerable = 0;       // duree de clignotement apres un degat
    this.rechargement = 0;
    this.animation = 0;
    this.imageEnnemi = 0;        // 0 ou 1 : alternance des deux dessins
    this.compteurImage = 0;

    /* Petites etoiles fixes en arriere-plan (decor uniquement) */
    this.etoiles = [];
    for (let i = 0; i < 34; i++) {
      this.etoiles.push({ x: hasard(0, D_LARGEUR), y: hasard(0, D_HAUTEUR - 60), taille: hasard(1, 2) });
    }

    this.construireAbris();
    this.preparerVague();
  },

  /** Construit les quatre abris destructibles. */
  construireAbris() {
    this.abris = [];
    const largeurAbri = D_ABRI[0].length * 6;          // 8 briques de 6 pixels
    const espace = (D_LARGEUR - largeurAbri * 4) / 5;
    for (let i = 0; i < 4; i++) {
      this.abris.push({
        x: Math.round(espace + i * (largeurAbri + espace)),
        y: D_HAUTEUR - 110,
        briques: D_ABRI.map((ligne) => ligne.split('').map((c) => (c === 'X' ? 1 : 0)))
      });
    }
  },

  /** Remplit la grille d'ennemis pour la vague en cours. */
  preparerVague() {
    this.ennemis = [];
    for (let rang = 0; rang < D_RANGEES; rang++) {
      for (let col = 0; col < D_COLONNES; col++) {
        this.ennemis.push({ col: col, rang: rang, vivant: true });
      }
    }
    this.totalEnnemis = this.ennemis.length;
    this.decalageX = 0;
    this.descente = Math.min(48, (this.vague - 1) * 8);
    this.sensX = 1;
    this.delaiTirEnnemi = 1.2;
    this.tirsEnnemis = [];
  },

  /** Position a l'ecran du coin haut-gauche d'un ennemi. */
  positionEnnemi(ennemi) {
    const margeX = (D_LARGEUR - ((D_COLONNES - 1) * D_ECART_X + 24)) / 2;
    return {
      x: margeX + ennemi.col * D_ECART_X + this.decalageX,
      y: 58 + ennemi.rang * D_ECART_Y + this.descente
    };
  },

  /** Vitesse horizontale du groupe : elle augmente quand il reste peu d'ennemis. */
  vitesseGroupe() {
    const vivants = this.ennemis.filter((e) => e.vivant).length;
    const proportionDetruits = 1 - vivants / this.totalEnnemis;
    return 24 + (this.vague - 1) * 7 + proportionDetruits * 55;
  },

  /** Points rapportes selon la rangee : les ennemis du haut valent plus cher. */
  valeur(rang) {
    if (rang === 0) return 30;
    if (rang === 1) return 20;
    return 10;
  },

  couleurRang(rang) {
    if (rang === 0) return '#ff4d9d';
    if (rang === 1) return '#c77dff';
    return '#38e8ff';
  },

  /* --- Reaction aux commandes --- */
  action(nom) {
    if (nom === 'feu') this.tirer();
  },

  /** Tire un projectile, si le canon est recharge et qu'il reste de la place. */
  tirer() {
    if (this.rechargement > 0 || this.tirsJoueur.length >= 3) return;
    this.tirsJoueur.push({ x: this.joueur.x, y: this.joueur.y - 10 });
    this.rechargement = 0.28;
    Sons.effet('tir');
  },

  /** Cree quelques particules colorees a l'endroit d'une explosion. */
  exploser(x, y, couleur, nombre) {
    for (let i = 0; i < nombre; i++) {
      this.particules.push({
        x: x, y: y,
        vx: hasard(-70, 70),
        vy: hasard(-70, 40),
        vie: 0.4 + Math.random() * 0.3,
        couleur: couleur
      });
    }
  },

  /**
   * Cherche une brique d'abri au point (x, y) et la detruit.
   * Renvoie true si un abri a bien ete touche.
   */
  frapperAbri(x, y) {
    for (const abri of this.abris) {
      const colonne = Math.floor((x - abri.x) / 6);
      const rangee = Math.floor((y - abri.y) / 6);
      if (rangee < 0 || rangee >= abri.briques.length) continue;
      if (colonne < 0 || colonne >= abri.briques[rangee].length) continue;
      if (abri.briques[rangee][colonne]) {
        abri.briques[rangee][colonne] = 0;
        /* On abime aussi les briques voisines : l'abri s'use plus vite. */
        const voisines = [[rangee, colonne - 1], [rangee, colonne + 1]];
        voisines.forEach((v) => {
          if (abri.briques[v[0]] && abri.briques[v[0]][v[1]] && Math.random() < 0.5) {
            abri.briques[v[0]][v[1]] = 0;
          }
        });
        this.exploser(x, y, '#4ef08a', 4);
        return true;
      }
    }
    return false;
  },

  /** Le joueur est touche : il perd une vie. */
  perdreVie() {
    if (this.invulnerable > 0) return;
    this.vies -= 1;
    this.invulnerable = 1.8;
    this.tirsEnnemis = [];
    this.exploser(this.joueur.x, this.joueur.y, '#ff5c5c', 16);
    Sons.effet('degat');
    if (this.vies <= 0) Moteur.terminer(this.score);
  },

  maj(dt) {
    this.animation += dt;
    if (this.rechargement > 0) this.rechargement -= dt;
    if (this.invulnerable > 0) this.invulnerable -= dt;

    /* --- Deplacement du vaisseau --- */
    let deplacement = 0;
    if (Entrees.estEnfoncee('gauche')) deplacement -= 1;
    if (Entrees.estEnfoncee('droite')) deplacement += 1;
    this.joueur.x += deplacement * this.joueur.vitesse * dt;
    const demi = this.joueur.largeur / 2;
    this.joueur.x = limiter(this.joueur.x, demi + 4, D_LARGEUR - demi - 4);

    /* Tir maintenu : on continue de tirer au rythme du rechargement. */
    if (Entrees.estEnfoncee('feu')) this.tirer();

    /* --- Deplacement du groupe d'ennemis --- */
    const vivants = this.ennemis.filter((e) => e.vivant);
    if (vivants.length === 0) {
      this.vague += 1;
      this.score += 100;
      Sons.effet('vague');
      this.preparerVague();
      return;
    }
    this.decalageX += this.sensX * this.vitesseGroupe() * dt;
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    vivants.forEach((e) => {
      const p = this.positionEnnemi(e);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + 24);
      maxY = Math.max(maxY, p.y + 18);
    });
    /* Arrive au bord : le groupe repart dans l'autre sens et descend. */
    if (minX < 8 && this.sensX < 0) { this.sensX = 1; this.descente += 14; }
    else if (maxX > D_LARGEUR - 8 && this.sensX > 0) { this.sensX = -1; this.descente += 14; }

    /* Les envahisseurs ont atteint le sol : c'est perdu. */
    if (maxY >= this.joueur.y - 4) {
      this.vies = 0;
      Moteur.terminer(this.score);
      return;
    }

    /* --- Tirs des ennemis --- */
    this.delaiTirEnnemi -= dt;
    if (this.delaiTirEnnemi <= 0) {
      this.delaiTirEnnemi = Math.max(0.32, 1.25 - this.vague * 0.1) * (0.6 + Math.random());
      /* On choisit un ennemi vivant, de preference celui du bas de sa colonne. */
      const tireur = vivants[hasard(0, vivants.length - 1)];
      const memeColonne = vivants.filter((e) => e.col === tireur.col);
      const plusBas = memeColonne.reduce((a, b) => (a.rang > b.rang ? a : b));
      const p = this.positionEnnemi(plusBas);
      this.tirsEnnemis.push({ x: p.x + 12, y: p.y + 18 });
    }

    /* --- Deplacement et collisions des tirs du joueur --- */
    for (let i = this.tirsJoueur.length - 1; i >= 0; i--) {
      const tir = this.tirsJoueur[i];
      tir.y -= 430 * dt;
      let touche = false;

      if (this.frapperAbri(tir.x, tir.y)) touche = true;

      if (!touche) {
        for (const ennemi of vivants) {
          const p = this.positionEnnemi(ennemi);
          if (tir.x >= p.x && tir.x <= p.x + 24 && tir.y >= p.y && tir.y <= p.y + 18) {
            ennemi.vivant = false;
            this.score += this.valeur(ennemi.rang) * this.vague;
            this.exploser(p.x + 12, p.y + 9, this.couleurRang(ennemi.rang), 10);
            Sons.effet('explosion');
            touche = true;
            break;
          }
        }
      }
      if (touche || tir.y < -12) this.tirsJoueur.splice(i, 1);
    }

    /* --- Deplacement et collisions des tirs ennemis --- */
    const vitesseTir = 150 + this.vague * 12;
    for (let i = this.tirsEnnemis.length - 1; i >= 0; i--) {
      const tir = this.tirsEnnemis[i];
      tir.y += vitesseTir * dt;
      let touche = false;

      if (this.frapperAbri(tir.x, tir.y)) touche = true;

      if (!touche &&
          tir.y >= this.joueur.y - this.joueur.hauteur / 2 &&
          tir.y <= this.joueur.y + this.joueur.hauteur / 2 &&
          Math.abs(tir.x - this.joueur.x) <= demi) {
        this.perdreVie();
        touche = true;
      }
      if (touche || tir.y > D_HAUTEUR + 12) this.tirsEnnemis.splice(i, 1);
    }

    /* --- Particules d'explosion --- */
    for (let i = this.particules.length - 1; i >= 0; i--) {
      const p = this.particules[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;                 // les particules retombent
      p.vie -= dt;
      if (p.vie <= 0) this.particules.splice(i, 1);
    }

    /* Alternance des deux dessins des ennemis (animation simple) */
    this.compteurImage += dt;
    if (this.compteurImage > 0.45) {
      this.compteurImage = 0;
      this.imageEnnemi = this.imageEnnemi === 0 ? 1 : 0;
    }
  },

  hud() {
    return [
      { label: 'SCORE', valeur: this.score },
      { label: 'VAGUE', valeur: this.vague },
      { label: 'VIES',  valeur: '♥'.repeat(Math.max(0, this.vies)) || '—' }
    ];
  },

  dessiner(ctx) {
    /* Ciel etoile */
    ctx.fillStyle = '#0a0819';
    ctx.fillRect(0, 0, D_LARGEUR, D_HAUTEUR);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    this.etoiles.forEach((e) => ctx.fillRect(e.x, e.y, e.taille, e.taille));

    /* Les envahisseurs */
    this.ennemis.forEach((ennemi) => {
      if (!ennemi.vivant) return;
      const p = this.positionEnnemi(ennemi);
      const espece = ennemi.rang < 2 ? D_ENNEMI_B : D_ENNEMI_A;
      dessinerMotif(ctx, espece[this.imageEnnemi], p.x, p.y, D_PIXEL, this.couleurRang(ennemi.rang));
    });

    /* Les abris */
    this.abris.forEach((abri) => {
      for (let y = 0; y < abri.briques.length; y++) {
        for (let x = 0; x < abri.briques[y].length; x++) {
          if (abri.briques[y][x]) {
            ctx.fillStyle = '#4ef08a';
            ctx.fillRect(abri.x + x * 6, abri.y + y * 6, 6, 6);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(abri.x + x * 6 + 4, abri.y + y * 6 + 4, 2, 2);
          }
        }
      }
    });

    /* Le vaisseau du joueur (il clignote juste apres avoir ete touche) */
    const clignote = this.invulnerable > 0 && Math.floor(this.invulnerable * 12) % 2 === 0;
    if (!clignote) {
      dessinerMotif(ctx, D_VAISSEAU,
                    this.joueur.x - this.joueur.largeur / 2,
                    this.joueur.y - this.joueur.hauteur / 2,
                    D_PIXEL, '#38e8ff');
    }

    /* Les tirs */
    ctx.fillStyle = '#ffd23f';
    this.tirsJoueur.forEach((t) => ctx.fillRect(t.x - 1.5, t.y - 5, 3, 10));
    ctx.fillStyle = '#ff4d9d';
    this.tirsEnnemis.forEach((t) => ctx.fillRect(t.x - 1.5, t.y - 5, 3, 10));

    /* Les particules d'explosion */
    this.particules.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.vie * 2);
      ctx.fillStyle = p.couleur;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    });
    ctx.globalAlpha = 1;

    /* Le sol */
    ctx.fillStyle = '#241d52';
    ctx.fillRect(0, D_HAUTEUR - 14, D_LARGEUR, 3);
  },

  vignette(ctx) {
    ctx.fillStyle = '#0a0819';
    ctx.fillRect(0, 0, 64, 64);
    dessinerMotif(ctx, D_ENNEMI_B[0], 8, 8, 2, '#ff4d9d');
    dessinerMotif(ctx, D_ENNEMI_A[0], 32, 8, 2, '#c77dff');
    dessinerMotif(ctx, D_ENNEMI_A[1], 20, 26, 2, '#38e8ff');
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(31, 40, 2, 8);
    dessinerMotif(ctx, D_VAISSEAU, 23, 50, 2, '#38e8ff');
  }
};

/* La liste des trois jeux, dans l'ordre d'affichage du menu. */
const JEUX = [jeuBlocs, jeuSerpent, jeuDefense];

/** Retrouve un jeu grace a son identifiant ("blocs", "serpent", "defense"). */
function jeuParId(id) {
  return JEUX.find((j) => j.id === id) || JEUX[0];
}

/* =========================================================================
   11. LE MENU PRINCIPAL
   ========================================================================= */

/** (Re)construit la liste des jeux du menu, avec le record de chacun. */
function construireMenu() {
  const zone = $('#liste-jeux');
  zone.innerHTML = '';

  JEUX.forEach((jeu) => {
    const carte = document.createElement('article');
    carte.className = 'carte';

    /* La vignette est un mini canvas dessine par le jeu lui-meme. */
    const vignette = document.createElement('canvas');
    vignette.className = 'carte__vignette';
    vignette.width = 64;
    vignette.height = 64;
    vignette.setAttribute('aria-hidden', 'true');
    jeu.vignette(vignette.getContext('2d'));

    const infos = document.createElement('div');
    infos.className = 'carte__infos';

    const titre = document.createElement('h2');
    titre.className = 'carte__nom';
    titre.textContent = jeu.nom;

    const description = document.createElement('p');
    description.className = 'carte__desc';
    description.textContent = jeu.description;

    const record = document.createElement('p');
    record.className = 'carte__record';
    const meilleur = Scores.meilleur(jeu.id);
    record.textContent = meilleur > 0 ? 'Record : ' + meilleur + ' pts' : 'Aucune partie jouée';

    infos.append(titre, description, record);

    const actions = document.createElement('div');
    actions.className = 'carte__actions';

    const boutonJouer = document.createElement('button');
    boutonJouer.className = 'btn';
    boutonJouer.textContent = 'Jouer';
    boutonJouer.addEventListener('click', () => {
      Sons.reveiller();
      Moteur.demarrer(jeu);
    });

    const boutonScores = document.createElement('button');
    boutonScores.className = 'btn btn--fantome';
    boutonScores.textContent = 'Scores';
    boutonScores.addEventListener('click', () => EcranScores.ouvrir(jeu.id, -1));

    actions.append(boutonJouer, boutonScores);
    carte.append(vignette, infos, actions);
    zone.append(carte);
  });
}

/* =========================================================================
   12. L'ECRAN DES MEILLEURS SCORES
   ========================================================================= */

const EcranScores = {
  idJeu: 'blocs',
  rangSurligne: -1,      // met en evidence le score qui vient d'etre enregistre

  /** Ouvre l'ecran des scores sur le jeu demande. */
  ouvrir(idJeu, rangSurligne) {
    this.idJeu = idJeu;
    this.rangSurligne = (typeof rangSurligne === 'number') ? rangSurligne : -1;
    this.construireOnglets();
    this.afficherListe();
    Ecrans.afficher('ecran-scores');
  },

  /** Un onglet par jeu, en haut de l'ecran. */
  construireOnglets() {
    const zone = $('#onglets-scores');
    zone.innerHTML = '';
    JEUX.forEach((jeu) => {
      const onglet = document.createElement('button');
      onglet.className = 'onglet';
      onglet.type = 'button';
      onglet.setAttribute('role', 'tab');
      onglet.setAttribute('aria-selected', String(jeu.id === this.idJeu));
      onglet.textContent = jeu.nom;
      onglet.addEventListener('click', () => this.ouvrir(jeu.id, -1));
      zone.append(onglet);
    });
  },

  /** Affiche le tableau des dix meilleurs scores du jeu choisi. */
  afficherListe() {
    const zone = $('#scores-liste');
    zone.innerHTML = '';
    const liste = Scores.liste(this.idJeu);

    if (liste.length === 0) {
      const vide = document.createElement('p');
      vide.className = 'vide';
      vide.textContent = 'Aucun score enregistré pour ce jeu. À vous de jouer !';
      zone.append(vide);
      return;
    }

    liste.forEach((entree, index) => {
      const ligne = document.createElement('div');
      ligne.className = 'ligne-score';
      if (index < 3) ligne.classList.add('ligne-score--podium');
      if (index === this.rangSurligne) ligne.classList.add('ligne-score--surligne');

      const rang = document.createElement('span');
      rang.className = 'ligne-score__rang';
      rang.textContent = (index + 1) + '.';

      const bloc = document.createElement('div');
      const pseudo = document.createElement('span');
      pseudo.className = 'ligne-score__pseudo';
      pseudo.textContent = entree.pseudo;      // textContent : aucun HTML n'est interprete
      const date = document.createElement('span');
      date.className = 'ligne-score__date';
      date.textContent = dateCourte(entree.date);
      bloc.append(pseudo, date);

      const points = document.createElement('span');
      points.className = 'ligne-score__points';
      points.textContent = entree.score;

      ligne.append(rang, bloc, points);
      zone.append(ligne);
    });
  }
};

/* =========================================================================
   13. LA FENETRE DE SAISIE DU PSEUDO
   ========================================================================= */

const ModalePseudo = {
  idJeu: null,
  score: 0,

  ouvrir(idJeu, score) {
    this.idJeu = idJeu;
    this.score = score;
    texteSur($('#modale-score'), String(score));
    const champ = $('#champ-pseudo');
    champ.value = Scores.dernierPseudo();
    $('#modale-pseudo').hidden = false;
    /* On donne le focus au champ, puis on selectionne le texte pour
       pouvoir le remplacer d'une seule frappe. */
    setTimeout(() => { champ.focus(); champ.select(); }, 60);
  },

  fermer() {
    $('#modale-pseudo').hidden = true;
  },

  /** Enregistre le score puis affiche le classement. */
  valider() {
    const brut = $('#champ-pseudo').value.trim().slice(0, 12);
    const pseudo = brut === '' ? 'JOUEUR' : brut.toUpperCase();
    Scores.memoriserPseudo(pseudo);
    const rang = Scores.ajouter(this.idJeu, pseudo, this.score);
    this.fermer();
    Moteur.arreterBoucle();
    EcranScores.ouvrir(this.idJeu, rang);
  }
};

/* =========================================================================
   14. MODE HORS LIGNE (service worker) ET INSTALLATION
   ========================================================================= */

/**
 * Le "service worker" est un petit programme qui garde une copie de tous
 * les fichiers de l'application. Grace a lui, le jeu se lance meme sans
 * connexion Internet apres la premiere visite.
 */
function installerServiceWorker() {
  const note = $('#etat-hors-ligne');

  if (location.protocol === 'file:') {
    note.textContent = 'Ouvrez la page via un petit serveur local pour activer le mode hors ligne.';
    return;
  }
  if (!('serviceWorker' in navigator)) {
    note.textContent = 'Ce navigateur ne gère pas le mode hors ligne.';
    return;
  }

  navigator.serviceWorker.register('sw.js')
    .then(() => {
      note.textContent = 'Prêt à jouer hors ligne ✓';
      note.classList.add('note--ok');
    })
    .catch(() => {
      note.textContent = 'Mode hors ligne indisponible.';
    });
}

/* Proposition d'installation sur l'ecran d'accueil (Android, Chrome, Edge…) */
let evenementInstallation = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();                  // on choisit nous-memes le moment
  evenementInstallation = e;
  $('#btn-installer').hidden = false;
});

window.addEventListener('appinstalled', () => {
  evenementInstallation = null;
  $('#btn-installer').hidden = true;
});

/* =========================================================================
   15. BRANCHEMENT DES BOUTONS ET DEMARRAGE
   ========================================================================= */

function brancherBoutons() {
  /* Tous les boutons « retour » ramenent au menu. */
  document.querySelectorAll('[data-quitter]').forEach((bouton) => {
    bouton.addEventListener('click', () => Moteur.quitter());
  });

  $('#btn-pause').addEventListener('click', () => Moteur.pause(!Moteur.enPause));
  $('#btn-reprendre').addEventListener('click', () => Moteur.pause(false));
  $('#btn-rejouer').addEventListener('click', () => {
    if (Moteur.jeu) Moteur.demarrer(Moteur.jeu);
  });

  /* Bouton du son */
  const boutonSon = $('#btn-son');
  const majBoutonSon = () => boutonSon.setAttribute('aria-pressed', String(Sons.actif));
  majBoutonSon();
  boutonSon.addEventListener('click', () => {
    Sons.reveiller();
    Sons.basculer();
    majBoutonSon();
    if (Sons.actif) Sons.effet('tourner');
  });

  /* Effacement des scores du jeu affiche */
  $('#btn-effacer-scores').addEventListener('click', () => {
    const jeu = jeuParId(EcranScores.idJeu);
    if (confirm('Effacer tous les scores de « ' + jeu.nom + ' » ?')) {
      Scores.effacer(jeu.id);
      EcranScores.rangSurligne = -1;
      EcranScores.afficherListe();
    }
  });

  /* Fenetre du pseudo */
  $('#form-pseudo').addEventListener('submit', (e) => {
    e.preventDefault();
    ModalePseudo.valider();
  });
  $('#btn-annuler-pseudo').addEventListener('click', () => ModalePseudo.fermer());

  /* Bouton d'installation de l'application */
  $('#btn-installer').addEventListener('click', async () => {
    if (!evenementInstallation) return;
    evenementInstallation.prompt();
    await evenementInstallation.userChoice;
    evenementInstallation = null;
    $('#btn-installer').hidden = true;
  });

  /* Le son ne peut demarrer qu'apres une action du joueur : on en profite. */
  document.addEventListener('pointerdown', () => Sons.reveiller());
  document.addEventListener('keydown', () => Sons.reveiller());
}

/** Point d'entree : tout commence ici. */
function demarrerApplication() {
  Sons.charger();
  Moteur.installer();
  Entrees.installer();
  installerGlissementCanvas();
  brancherBoutons();
  construireMenu();

  /* Les boutons tactiles ne s'affichent que sur les appareils tactiles. */
  if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) {
    document.body.classList.add('tactile-actif');
  }

  installerServiceWorker();
}

demarrerApplication();
