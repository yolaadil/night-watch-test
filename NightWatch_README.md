# The Night Watch — WebXR Guided Museum Experience

A WebXR prototype for exploring Rembrandt's *The Night Watch* in an immersive museum setting. The experience is built with **A-Frame/WebXR** and designed primarily for **Meta Quest Browser**.

The prototype combines gaze-based interaction, visual attention cues, high-resolution image tiles, adaptive narration, and interaction logging for user studies.

## Current Experience

The current experimental build presents **three unvisited points of interest (POIs) at a time**, giving the visitor freedom to select one by looking at it.

Typical flow:

1. Enter a participant ID and select a visitor profile.
2. Enter immersive VR mode.
3. The introductory narration (`NW001`) begins after the configured VR-start delay.
4. Three unvisited POIs are visually cued.
5. The visitor looks toward one of the cued regions.
6. The gaze pointer changes from **black to red** when it enters the target region.
7. Maintaining gaze triggers target acquisition.
8. The selected region is explored using narration and high-resolution tiles.
9. The selected POI is marked visited and further unvisited POIs are offered.

## Visitor Profiles

The experience supports three narration profiles:

- `child`
- `general`
- `expert`

Narration audio is expected under:

```text
audio/
├── child/
├── general/
└── expert/
```

Audio files use narrative node identifiers such as `NW001.mp3`, `NW011.mp3`, etc.

## Narrative Corpus

The experience uses an extended *Night Watch* narrative corpus containing up to **100 narrative nodes**.

```text
corpus/nightwatch_nodes.json
```

The nodes provide narrative material associated with the visitor profiles and painting POIs.

## Points of Interest

Spatial POI definitions are loaded from:

```text
integration/nightwatch_pois.json
```

The tour contains approximately two dozen painting regions, including the Captain, Lieutenant, Girl, Standard Bearer, musketeers, Drummer, Dog, groups of figures, Cartouche, architecture, conservation-related regions, and whole-painting content.

The POI geometry is intended to be the **single spatial reference** for:

```text
POI position
   ↓
visual cue
   ↓
gaze activation region
   ↓
zoom / high-resolution target
```

Some POIs currently have manual registration corrections in the HTML while their positions are being calibrated in VR.

## Visual Attention Cue

The current guidance cue is a soft transparent pulsing overlay positioned over a target region. Relevant parameters are stored in `MARCO_CONFIG`.

Current pulse timing:

```javascript
cueOpacityMin: 0.08
cueOpacityMax: 0.20
cuePulseMs: 500
```

The gaze pointer is normally **black** and changes to **red** when gaze enters the active target region.

## Gaze Interaction

The experience uses head-directed gaze through the headset camera. Current configuration includes:

```javascript
orientationMs: 2000
activationMs: 2200
departureGraceMs: 400
maxAngularVelocityDegPerSec: 15
```

These parameters control orientation, target acquisition/dwell, departure tolerance, and head-motion stability.

## High-Resolution Tiles

The base painting is loaded from:

```text
painting_low.jpg
```

High-resolution image regions are loaded dynamically from the tile pyramid:

```text
tiles/<level>/<column>_<row>.jpeg
```

Only tiles needed for the selected region are loaded, rather than displaying the complete full-resolution painting continuously. This is important for Meta Quest performance.

### DZI

A `.dzi` file is **not currently read by the HTML**. Tile geometry and pyramid information are calculated directly in JavaScript.

A future improvement is to use DZI metadata as the authoritative source for image dimensions, tile size, overlap, format, and pyramid levels. This could also make tile registration easier to maintain.

## Logging

The prototype includes a study logger for experimental testing. It records events related to:

- participant/session information
- visitor profile
- VR entry and timing
- head/gaze movement
- guidance presentation
- offered POIs
- target acquisition
- cue success/timeouts
- narration
- POI visits
- zoom/focus interaction
- timing and session duration

Head/gaze information is sampled at approximately **5 Hz**.

Study data can be exported from the interface using **Export Study Data**, producing a JSON file for later analysis.

Potential measures derived from the log include total VR experience time, POIs visited, POI selection order, choices among simultaneously presented POIs, target acquisition time, cue success/timeouts, narration exposure/completion, total head movement, and gaze/head trajectory.

## Repository Structure

```text
/
├── index.html                         # Main WebXR experience
├── painting_low.jpg                   # Low-resolution base painting
├── corpus/
│   └── nightwatch_nodes.json          # Narrative corpus
├── integration/
│   └── nightwatch_pois.json           # POI geometry/registration
├── audio/
│   ├── child/
│   ├── general/
│   └── expert/
└── tiles/
    └── <level>/
        ├── 0_0.jpeg
        ├── 1_0.jpeg
        └── ...
```

If multiple experimental HTML conditions are stored in the same repository, each can be opened directly by filename through GitHub Pages.

## Running the Prototype

The experience should be served through a web server rather than opened as a local `file://` page because it loads JSON, audio, and image assets using browser requests.

For deployment, the repository can be hosted using **GitHub Pages** and opened in Meta Quest Browser.

For a typical study session:

1. Open the hosted page in Meta Quest Browser.
2. Enter the participant ID.
3. Select a visitor profile.
4. Enter VR.
5. Follow or choose among the visual cues.
6. Export the study log after the session.

## Performance Notes

Meta Quest performance is a priority. The implementation avoids keeping the entire full-resolution painting in memory and instead loads local high-resolution tiles when required.

When debugging VR distortion or lag, check the number of high-resolution tiles loaded simultaneously, duplicate transparent overlays, texture disposal, painting scaling during zoom, repeated animation/render loops, and unnecessary A-Frame entities.

## Experimental Status

This repository is an active research prototype. POI registration, cue appearance, gaze thresholds, narration timing, and VR performance are still being calibrated through iterative testing.

The system is part of ongoing work on gaze-guided and adaptive immersive museum experiences, with *The Night Watch* serving as the current prototype artwork.
