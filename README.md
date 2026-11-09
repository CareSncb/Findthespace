# Find the Space

Jeu de football qui apprend aux enfants à bien se placer : le joueur écrit son prénom, choisit le 5, 8 ou 11 contre 11 et son poste, puis décide vite quand ouvrir ou fermer le jeu. En flamand et en français.

## Récupérer l'IPA

Téléchargez directement la dernière version : [FindTheSpace-unsigned.ipa](https://github.com/CareSncb/Findthespace/releases/download/ipa-latest/FindTheSpace-unsigned.ipa). Le fichier est remplacé à chaque compilation.

Cet IPA n'est **pas signé** : Apple exige une signature pour l'installer sur un iPhone.

- **Sur votre iPhone :** signez-le avec Sideloadly ou AltStore et un identifiant Apple gratuit. L'installation expire après environ 7 jours.
- **Pour des testeurs :** il faut un compte Apple Developer payant, puis TestFlight.

## Structure

- `src/game.html` : le jeu, seul fichier à modifier pour changer le contenu.
- `scripts/build-web.mjs` : prépare la page pour l'application, avec ses polices hors ligne.
- `assets/icon-1024.png` : l'icône de l'application.
- `.github/workflows/ios.yml` : la compilation sur Mac par GitHub Actions.
