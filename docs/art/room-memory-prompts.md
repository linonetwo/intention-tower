# Antimeme room-memory backgrounds

Generator: GPT Image 2 through the user-authorized proxy-imagegen Responses API.
Date: 2026-10-24. Each fenced block is the exact submitted prompt.

## archive

```text
Use case: stylized-concept
Asset type: production 2D side-scrolling RPG background, one room, PNG 1536x1024 landscape.
Primary request: a warm archive room with tall honey-colored wooden bookcases containing cream and muted teal bound archive volumes, many small wooden index-card drawers with brass handles, closed document boxes and rolled documents. Distinct archive identity, not a laboratory. Leave a broad clear central wall section between storage furniture.
Style/medium: polished warm hand-painted anime fantasy game environment, soft cel shading, clean delicate brown outlines, pale cream stone/plaster walls, light honey wood, restrained sage and muted teal accents, soft golden daylight. Match a cozy side-scrolling research-room game, not photorealistic.
Composition/framing: strict straight-on orthographic FRONT ELEVATION of the back wall. Camera exactly perpendicular to wall. All shelves, drawers and furniture show front faces only. Every horizontal line stays horizontal. No visible side walls, no room corners, no vanishing point, no converging floor lines. A single uninterrupted flat horizontal walkable platform crosses the entire image at y=805 of 1024, from left edge to right edge. Its narrow top surface is a straight line; below y=805 is a simple light cream decorative platform fascia extending to the bottom edge. All room furnishings stay behind that line and never obstruct it. Open left and right traversal edges on the same floor height. No raised steps.
Lighting/mood: welcoming soft morning sunlight, warm and quiet, readable even detail.
Constraints: no people, no animals, no silhouettes, no text, no letters, no numbers, no labels, no signage, no UI, no border, no watermark. Book spines and drawer labels must be blank. Do not draw an angled floor or a perspective room. Deliver exactly one complete room background, 1536x1024 pixels.
```

## maproom

```text
Use case: stylized-concept
Asset type: production 2D side-scrolling RPG background, one room, PNG 1536x1024 landscape.
Primary request: a warm map display and surveying room with large framed parchment maps on the cream back wall, abstract unlabeled coastlines, a wooden map rack of rolled charts, brass surveying instruments displayed on narrow wall shelves, a front-facing drafting cabinet and a small globe at the side. Distinct cartography room identity, not an archive or a laboratory. Keep the central lower wall open and uncluttered.
Style/medium: polished warm hand-painted anime fantasy game environment, soft cel shading, clean delicate brown outlines, pale cream stone/plaster walls, light honey wood, restrained sage and muted teal accents, soft golden daylight. Match a cozy side-scrolling research-room game, not photorealistic.
Composition/framing: strict straight-on orthographic FRONT ELEVATION of the back wall. Camera exactly perpendicular to wall. All shelves, cabinet and furniture show front faces only. Every horizontal line stays horizontal. No visible side walls, no room corners, no vanishing point, no converging floor lines. A single uninterrupted flat horizontal walkable platform crosses the entire image at y=805 of 1024, from left edge to right edge. Its narrow top surface is a straight line; below y=805 is a simple light cream decorative platform fascia extending to the bottom edge. All room furnishings stay behind that line and never obstruct it. Open left and right traversal edges on the same floor height. No raised steps.
Lighting/mood: welcoming soft morning sunlight, warm and quiet, readable even detail.
Constraints: no people, no animals, no silhouettes, no text, no letters, no numbers, no labels, no signage, no UI, no border, no watermark. Maps contain only abstract shapes and unlabeled contour lines, never writing. Do not draw an angled floor or a perspective room. Deliver exactly one complete room background, 1536x1024 pixels.
```

## conservatory

```text
Use case: stylized-concept
Asset type: production 2D side-scrolling RPG background, one room, PNG 1536x1024 landscape.
Primary request: a warm indoor botanical conservatory with tall sage-green framed glass windows across the back wall, lush leafy ferns and broad-leaf plants in terracotta and cream pots on low wooden shelves, trailing vines above, a few small pale blossoms and a simple watering can. Distinct living greenhouse identity, not a laboratory, archive or map room. Keep central lower wall open enough for clear character silhouettes. All plants are contained behind the walking platform.
Style/medium: polished warm hand-painted anime fantasy game environment, soft cel shading, clean delicate brown outlines, pale cream stone/plaster walls, light honey wood, restrained sage and muted teal accents, soft golden daylight. Match a cozy side-scrolling research-room game, not photorealistic.
Composition/framing: strict straight-on orthographic FRONT ELEVATION of the back wall. Camera exactly perpendicular to wall. Windows and shelves are front-facing with no depth convergence. Every horizontal line stays horizontal. No visible side walls, no room corners, no vanishing point, no converging floor lines. A single uninterrupted flat horizontal walkable platform crosses the entire image at y=805 of 1024, from left edge to right edge. Its narrow top surface is a straight line; below y=805 is a simple light cream decorative platform fascia extending to the bottom edge. All room furnishings stay behind that line and never obstruct it. Open left and right traversal edges on the same floor height. No raised steps.
Lighting/mood: welcoming soft morning sunlight through glass, warm and quiet, readable even detail.
Constraints: no people, no animals, no silhouettes, no text, no letters, no numbers, no labels, no signage, no UI, no border, no watermark. No floor plants obstructing the walking line. Do not draw an angled floor or a perspective room. Deliver exactly one complete room background, 1536x1024 pixels.
```

## Reception reuse

`antimeme_reception` reuses the already-generated straight-on
`sideview/rooms/antimeme-division.png`; visual review confirms an uninterrupted
horizontal platform and front-facing room with no perspective side walls.
This is explicitly existing art, not a fourth image generation.

## Delivered-image review

All three source PNGs are 1536×1024 and were visually inspected. They retain
their original generated pixels: no resampling, geometry stretching or painted
substitutes. The real platform top is y=736 in archive, y=787 in maproom and
y=697 in conservatory, not the requested y=805. Runtime floor anchors use these
observed values. Each image has a continuous horizontal platform, front-facing
room, readable central character band, no visible people, writing, UI or
watermark. The three rooms are visibly distinguished by dense book/drawer
storage, parchment maps/surveying instruments, and glass/foliage respectively.

Archive completed on attempt 3 after two SSE failures; maproom and conservatory
completed on attempt 1. Retry handling was performed by the authorized skill
script; no successfully generated image was requested again.
