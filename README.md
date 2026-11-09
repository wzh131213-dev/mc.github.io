# mc.github.io

Browser-based voxel sandbox game built with React, TypeScript, Vite and Three.js.

## Rendering pipeline

The current rendering upgrade introduces:

- Physically lit voxel terrain using `MeshStandardMaterial` with high-roughness surfaces.
- Hemisphere fill lighting and a warm directional sun light.
- PCF soft real-time shadows for opaque chunk meshes.
- Device-aware shadow-map resolution (512px touch devices, 1024px desktop).
- ACES filmic tone mapping and sRGB output.
- A muted, cool-neutral procedural voxel texture palette.
- Computed vertex normals while preserving the existing face shading and ambient-occlusion vertex colors.

Water remains transparent and does not cast or receive shadows to avoid unstable transparent shadow artifacts.

## Development

```bash
npm ci
npm run dev
```

Production build:

```bash
npm run build
```

Type check:

```bash
npx tsc --noEmit
```

The project is configured for GitHub Pages under `/mc.github.io/`.
