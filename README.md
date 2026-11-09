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


## 背包整合阶段

当前分支开始将物品栏接入原有 React/Three.js 游戏入口：游戏中按 `E` 打开背包，点击物品可替换当前选中的快捷栏槽位，`Esc` 关闭背包。该阶段先接入现有世界已经支持的基础方块；完整 Minecraft Java 1.20.4 方块/物品注册表、生物实体与行为、掉落和合成仍需后续分阶段实现，不能将本阶段误认为完整原版内容已经全部完成。
