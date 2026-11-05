# Find The Space

Jeu d'exploration spatiale en 3D dans le navigateur (Three.js / WebGL 2).
Pilotez votre vaisseau dans le système Kepler-Æ et retrouvez les **7 signaux perdus**.

## Lancer le jeu

Les modules ES nécessitent un serveur HTTP local :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Commandes

| Touche | Action |
| --- | --- |
| Souris | Diriger le vaisseau |
| Z / W · S | Accélérer · Ralentir |
| Q / A · D | Roulis |
| Maj | Boost |
| Espace | Freinage |

## Rendu

- Pipeline HDR (half-float, MSAA 4x), tone mapping ACES, bloom, aberration chromatique, vignettage, grain
- Planètes 100 % procédurales en shader : relief avec normales calculées, océans spéculaires, calottes, lumières des villes côté nuit, nuages animés, atmosphère avec diffusion et couchers de soleil
- Monde de lave à fissures incandescentes, géante gazeuse à bandes et tempête, anneaux avec ombre portée de la planète, monde de glace, lune cratérisée
- Soleil à granulation animée, couronne, lens flare avec occultation par les planètes
- Voie lactée et nébuleuses procédurales, 9000 étoiles HDR
- Vaisseau PBR (métal clearcoat, verre) avec réflexions issues du ciel (PMREM), flammes et traînées de réacteur
- Ceinture de 2600 astéroïdes instanciés, poussière spatiale qui matérialise la vitesse
- Son procédural (WebAudio)
