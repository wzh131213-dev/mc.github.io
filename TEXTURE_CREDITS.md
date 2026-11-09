# Texture attribution

The block texture atlas is built during GitHub Actions from **Fresh Textures**, a Minecraft Java resource pack by **godhusk**.

- Project: https://modrinth.com/project/fresh-textures
- Compatibility: Minecraft Java 26.3
- License listed by Modrinth: **CC BY-SA 4.0**
- License text: https://creativecommons.org/licenses/by-sa/4.0/

The build script downloads the 26.3-compatible archive, verifies its published SHA-512 hash, reads block textures, resizes them to 16×16 atlas cells, and creates a per-block atlas. Missing texture names receive deterministic generated fallback pixels; they are not represented as original pack artwork.

The game code, world registry, and generated fallback textures are separate from the Fresh Textures artwork. The atlas is rebuilt during deployment and is not committed as a binary asset.
