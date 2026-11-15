# Anatomy Study Tool

An installable 3D human anatomy atlas for study: pick any muscle, bone, vessel, nerve or organ,
peel the body layer by layer like a dissection, read each structure's origin, insertion, action,
innervation and location, watch the physiology of the body's systems, and test yourself with
quizzes and flashcards. It runs in any modern browser and installs as an app on iPad, phone,
Windows, Mac and Chromebook. After installing (and pressing "Download everything for offline
use" in About) it works without internet.

**A study aid, not a medical reference.** The models and text come from open sources and are
simplified for teaching; some parts are approximate. Check anything important against a textbook
or instructor. Not for diagnosis or treatment.

## Using it

- **Explore**: tap a structure to select it. Drag to rotate, pinch or scroll to zoom, right-drag
  or two-finger drag to pan. The Layers panel turns systems on and off; the Dissect slider peels
  from skin to skeleton. Search finds structures by English or Latin name.
  Keyboard: F focus, H hide, I isolate, X X-ray, Esc clear.
- **Physiology**: animated lessons (the heart's cardiac cycle and blood flow first).
- **Study**: flashcards with spaced repetition and quizzes, including "find it on the model".
- **Male / Female**: the switch in the top bar shows the male or the female body. Search, layers,
  lessons, flashcards and quizzes follow the body that is shown.

## Building it yourself

```sh
npm install
npm run data:fetch   # downloads Z-Anatomy and converts its FBX models (needs git, ~3 GB of disk)
npm run data:build   # turns them into the compressed web data in public/data
npm run dev          # local development server
npm run build        # production build into dist/
```

The generated data in `public/data` is committed, so `npm install && npm run build` is enough to
deploy. The GitHub Actions workflow in `.github/workflows/pages.yml` publishes `dist/` to GitHub
Pages on every push to `main`.

## Design decisions

Recorded here so they can be revisited.

1. **Installable web app (PWA) rather than an app-store app.** One code base runs on every
   device, installs from the browser, updates itself, and can be wrapped as a native app later
   (Capacitor) if app-store distribution is wanted. WebGL gives the same 3D capability as native
   for this kind of model.
2. **Open-licensed anatomy only.** The body comes from Z-Anatomy, which is derived from
   BodyParts3D; the female organs come from the Human Reference Atlas (CC BY 4.0). Nothing
   proprietary is used. The trade-off is that the open atlas has gaps (see
   below) that commercial atlases fill with paid artwork.
3. **Every structure in the source is kept.** The pipeline simplifies meshes (about 9.3 million
   triangles down to 3.6 million) but never drops a structure. Left and right copies of
   symmetric parts are stored once and mirrored at runtime.
4. **Muscle facts are curated, everything else comes from the atlas.** Origin, insertion,
   action, innervation and blood supply for about 230 muscles are written out in
   `src/data/muscles.ts`; other structures show text derived from the open Wikipedia articles
   that ship with Z-Anatomy.
5. **Physiology is taught with an accurate schematic beside the 3D model.** The 3D heart beats
   and the vessels pulse in sync, while a 2D diagram shows exactly which valves are open and
   where blood goes in each phase, because blood paths inside a real heart are hard to see.
6. **Study progress is stored on the device** (no accounts). Flashcards use spaced repetition
   (Again / Hard / Good / Easy, intervals from a minute to months). Decks are generated from the
   atlas, so every structure is quizzable; muscle decks use the curated facts. Exporting and
   importing progress can be added later.
7. **Physiology lessons pair the model with schematics.** Each lesson animates the 3D structures
   (heart chambers squeeze, valves turn green when open, vessels pulse in the direction of flow,
   lungs and diaphragm move, nerves carry impulses) and a 2D diagram shows what cannot be seen
   at this scale (cells, alveoli, sarcomeres, nephrons). Timings and pressures are textbook
   resting values, simplified for teaching.
8. **Non-commercial use.** A few source models (inner ear, kidney) are licensed
   non-commercially, so the app as a whole is for personal study, not for sale.
9. **One body with male and female versions.** The open atlas (Z-Anatomy / BodyParts3D) is a
   male body. The female organs come from the Human Reference Atlas, built from the Visible Human
   Female, and are fitted into the same body rather than shipping a second full skeleton and
   musculature. The pelvic organs are placed by matching the female pelvic bones to this body's
   pelvis (affine ICP, about 7 mm average distance), then shifted so the female bladder sits where
   this body's bladder is. The breasts are reshaped onto this body's chest: their height above a
   smooth chest-wall baseline is kept, and the tissue beneath is compressed to fit. Male-only
   structures are flagged `sx: 'm'` and female ones `sx: 'f'` in `meta.json`; the app hides the
   other set. The pelvic part of the ovarian vessels and the female urethra are simplified drawings
   and say so in their descriptions. The bony pelvis stays the male one.

## Known gaps in the open atlas

- Some small muscles (several of the palate, tongue and perineum) and many small named vessels
  and nerve branches are not modelled in the source data.
- Not modelled at all in the open atlas: the ileum, caecum, rectum and anal canal, the thoracic
  duct, and the anterior leaflet of the mitral and tricuspid valves. Lessons mention these where
  relevant. They are the first candidates for added models.
- Female body: the clitoris, labia minora, vestibular glands and the female perineal muscles are
  not yet separate structures (the vulva is modelled as a skin surface), and the skeleton is the
  male one, so the female pelvis shape is not shown.
- Microscopic anatomy (cells, nephrons, alveoli, synapses) is shown in the physiology lessons as
  diagrams, not as 3D anatomy.

## Licences and credits

- 3D models and anatomical names: [Z-Anatomy](https://github.com/LluisV/Z-Anatomy) by Lluís
  Vinent and contributors, CC BY-SA 4.0, based on
  [BodyParts3D](https://lifesciencedb.jp/bp3d/) © The Database Center for Life Science,
  CC BY-SA 2.1 Japan. Inner ear models from the University of Dundee (CC BY-NC-SA) and kidney
  model (CC BY-NC) as distributed with Z-Anatomy.
- Female anatomy (uterus, ovaries, uterine tubes, vagina, their ligaments and uterine vessels,
  breasts, and the female skin of the breast and vulva):
  [HuBMAP Human Reference Atlas 3D Reference Object Library](https://github.com/hubmapconsortium/ccf-3d-reference-object-library),
  Visible Human Female, by Kristen Browne, Heidi Schlehlein and colleagues (NIH award
  OT2OD026671), CC BY 4.0. Changes: simplified, scaled and fitted into this body
  (`pipeline/add-female.mjs`).
- Descriptions: Wikipedia articles distributed with Z-Anatomy, CC BY-SA. The descriptions of the
  female structures were written for this project (`pipeline/female-text.mjs`).
- Because the models are share-alike, the processed data in `public/data` is released under
  CC BY-SA 4.0 as well. The application code is MIT licensed.
- Libraries: three.js, three-mesh-bvh, meshoptimizer, glTF-Transform, Preact.
