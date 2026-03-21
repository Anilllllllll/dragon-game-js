# 🐉 iDragon Adventures

An industry-level, deploy-ready **endless runner game** built with pure HTML, CSS, and JavaScript — no frameworks, no build step.

![Game Preview](https://raw.githubusercontent.com/Anilllllllll/dragon-game-js/master/bg.png)

---

## 🎮 Play Now

**Local:** `npx serve . --listen 3000` → open `http://localhost:3000`

**GitHub Pages:** Enable Pages in repo Settings → Source: `master / root`  
URL: `https://anilllllllll.github.io/dragon-game-js/`

---

## ✨ Features

| Feature | Details |
|---------|---------|
| 🌌 3D Perspective Road | Vanishing-point lane lines, glowing rails, parallax sky |
| 🐉 Player Animation | Running leg cycle + wing flutter, squash/stretch on jump/land |
| ⬆️ Jump Physics | Gravity arc, double-jump at Level 3, 0.2s grace period |
| ⬇️ Duck | Slide under HIGH obstacles |
| ↔️ Move | Walk forward / backward freely |
| 🚧 4 Obstacle Types | LOW (jump over), HIGH (duck under), FLYING (mid-air) |
| ❤️ Lives System | 3 lives, invincibility blink after hit, red damage flash |
| 🏆 Scoring | +10 per obstacle × combo multiplier (×1–×8), distance ticks |
| 📈 Level Up | Every 500 pts → speed increases, new obstacles unlock |
| 💾 High Score | Persisted to `localStorage` |
| 💥 Particles | Dust, fire bursts, floating score text, confetti on new record |
| 🔊 Sound | `music.mp3` loop + `gameover.mp3` + Web Audio API SFX |
| 📱 Mobile | Touch tap/swipe + on-screen Jump/Duck buttons |
| 🌐 PWA | `manifest.json` + `sw.js` — installable, works offline |

---

## 🕹️ Controls

| Key | Action |
|-----|--------|
| `Space` / `↑` | Jump |
| `↓` | Duck / Slide |
| `←` / `A` | Move backward |
| `→` / `D` | Move forward |
| `P` | Pause / Resume |
| `R` | Restart (on Game Over) |

**Mobile:** Tap = Jump • Swipe Down = Duck • On-screen buttons

---

## 📁 Project Structure

```
dragon-game-js/
├── index.html      # Game shell: canvas, HUD, all screen overlays
├── style.css       # Dark neon theme, glassmorphism HUD, animations
├── game.js         # Full game engine (~700 lines)
├── manifest.json   # PWA manifest
├── sw.js           # Service worker (offline cache)
├── bg.png          # Background image
├── dino.png        # Player sprite
├── dragon.png      # Obstacle sprite
├── music.mp3       # Background music
└── gameover.mp3    # Game over sound
```

---

## 🚀 Deploy

**Netlify / Vercel / GitHub Pages** — drag-and-drop the folder. Zero build required.

```bash
# Local dev server
npx serve . --listen 3000
```

---

## 🛠️ Tech Stack

- **HTML5 Canvas** — rendering engine
- **Vanilla JS (ES Modules)** — no dependencies
- **Web Audio API** — procedural SFX
- **CSS** (Glass morphism + custom properties)
- **PWA** — offline-ready, installable

---

Made with ❤️ by [Anil Kumar](https://github.com/Anilllllllll)
