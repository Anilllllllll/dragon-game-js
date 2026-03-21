/**
 * iDragon Adventures — Industry-Level Game Engine
 * Canvas-based 3D perspective endless runner
 */

'use strict';

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════
const C = {
  GRAVITY:        2200,      // px/s² (reduced so jump arc is longer)
  JUMP_FORCE:    -1050,      // px/s (stronger jump = clears obstacles easily)
  DUCK_SPEED:     600,       // how fast duck lowers hitbox
  BASE_SPEED:     320,       // px/s initial
  SPEED_INC:      18,        // px/s per level
  MAX_SPEED:      900,
  LEVEL_SCORE:    500,       // points per level
  GROUND_Y:       0.82,      // fraction of canvas height
  MIN_OBSTACLE_GAP: 1100,    // px between obstacles (generous gap)
  LIVES_MAX:      3,
  INVINCIBLE_MS:  2000,
  INVINC_BLINK:   120,       // ms per blink cycle
  PARTICLE_MAX:   200,
  SCORE_PER_OBS:  10,
  SCORE_TICK_MS:  100,       // distance score tick
  COMBO_TIMEOUT:  3000,      // combo resets if idle 3s
  DOUBLE_JUMP_LV: 3,
  JUMP_GRACE:     0.20,      // seconds after jump start: no collision check
};

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════
let STATE = 'MENU'; // MENU | COUNTDOWN | PLAYING | PAUSED | GAMEOVER

const game = {
  score:        0,
  highScore:    parseInt(localStorage.getItem('dragon_hs') || '0'),
  level:        1,
  speed:        C.BASE_SPEED,
  lives:        C.LIVES_MAX,
  combo:        1,
  maxCombo:     1,
  comboTimer:   0,
  invincible:   false,
  invincTimer:  0,
  blinkTimer:   0,
  showPlayer:   true,
  scoreTick:    0,
  newHighScore: false,
  muted:        localStorage.getItem('dragon_mute') === '1',
  jumpGrace:    0,       // seconds of post-jump grace (no collision)
  stepTimer:    0,       // running animation clock
};

// ═══════════════════════════════════════════════
//  CANVAS SETUP
// ═══════════════════════════════════════════════
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let W, H, GROUND; // set in resize()

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  GROUND = H * C.GROUND_Y;
  if (player) {
    player.groundY = GROUND - player.h;
    if (!player.jumping) player.y = player.groundY;
  }
}
window.addEventListener('resize', resize);

// ═══════════════════════════════════════════════
//  ASSETS
// ═══════════════════════════════════════════════
const IMG = {};
const imgSrcs = {
  bg:     'bg.png',
  player: 'dino.png',
  dragon: 'dragon.png',
};

function loadImages() {
  return Promise.all(
    Object.entries(imgSrcs).map(([k, src]) =>
      new Promise(r => {
        const img = new Image();
        img.onload = img.onerror = () => { IMG[k] = img; r(); };
        img.src = src;
      })
    )
  );
}

// ═══════════════════════════════════════════════
//  SOUND MANAGER
// ═══════════════════════════════════════════════
const SFX = {};
let bgMusic, gameoverSfx, audioCtx;

function initAudio() {
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  bgMusic      = new Audio('music.mp3');
  bgMusic.loop = true;
  bgMusic.volume = 0.35;
  gameoverSfx  = new Audio('gameover.mp3');
  gameoverSfx.volume = 0.7;
}

function playBg() {
  if (game.muted) return;
  bgMusic.currentTime = 0;
  bgMusic.play().catch(() => {});
}
function stopBg() { bgMusic.pause(); bgMusic.currentTime = 0; }
function pauseBg() { bgMusic.pause(); }
function resumeBg() { if (!game.muted) bgMusic.play().catch(() => {}); }
function playGameover() { if (game.muted) return; gameoverSfx.currentTime = 0; gameoverSfx.play().catch(() => {}); }

function playTone(freq, dur = 0.05, type = 'sine', vol = 0.18) {
  if (game.muted || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
  } catch(e) {}
}

const SFX_JUMP   = () => { playTone(340, 0.12, 'square', 0.12); playTone(520, 0.10, 'square', 0.08); };
const SFX_SCORE  = () => playTone(880, 0.06, 'sine', 0.1);
const SFX_COMBO  = () => { playTone(660, 0.05, 'square', 0.08); playTone(1100, 0.07, 'square', 0.10); };
const SFX_HIT    = () => { playTone(120, 0.2, 'sawtooth', 0.2); playTone(80, 0.3, 'sawtooth', 0.15); };

// ═══════════════════════════════════════════════
//  PARALLAX BACKGROUND
// ═══════════════════════════════════════════════
const layers = [
  { offset: 0, speed: 0.05, draw: drawMountains },
  { offset: 0, speed: 0.2,  draw: drawClouds },
];
let cloudData = [];
let mountainData = [];

function initBgData() {
  mountainData = Array.from({length: 6}, (_, i) => ({
    x: i * 320 + Math.random() * 200,
    w: 260 + Math.random() * 180,
    h: 90 + Math.random() * 130,
    hue: 270 + Math.random() * 40,
  }));
  cloudData = Array.from({length: 8}, (_, i) => ({
    x: i * 280 + Math.random() * 120,
    y: 30 + Math.random() * H * 0.25,
    w: 120 + Math.random() * 140,
    h: 30 + Math.random() * 40,
    opacity: 0.1 + Math.random() * 0.15,
  }));
}

function drawMountains(offset) {
  mountainData.forEach(m => {
    const x = ((m.x - offset * 60) % (W + 400) + W + 400) % (W + 400) - 200;
    const gradient = ctx.createLinearGradient(x, GROUND - m.h, x + m.w * 0.5, GROUND);
    gradient.addColorStop(0, `hsla(${m.hue}, 40%, 14%, 0.7)`);
    gradient.addColorStop(1, `hsla(${m.hue}, 30%, 6%, 0)`);
    ctx.beginPath();
    ctx.moveTo(x, GROUND);
    ctx.lineTo(x + m.w * 0.5, GROUND - m.h);
    ctx.lineTo(x + m.w, GROUND);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  });
}

function drawClouds(offset) {
  cloudData.forEach(c => {
    const x = ((c.x - offset * 120) % (W + 300) + W + 300) % (W + 300) - 150;
    ctx.beginPath();
    ctx.ellipse(x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180, 120, 255, ${c.opacity})`;
    ctx.fill();
  });
}

function drawSky() {
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND);
  grad.addColorStop(0,   '#050009');
  grad.addColorStop(0.3, '#0d0020');
  grad.addColorStop(0.7, '#1a0035');
  grad.addColorStop(1,   '#2a004a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, GROUND);
}

function drawStars(t) {
  if (!starsCache) buildStarsCache();
  ctx.save();
  ctx.globalAlpha = 0.8;
  starsCache.forEach(s => {
    const twinkle = 0.5 + 0.5 * Math.sin(t * s.freq + s.phase);
    ctx.globalAlpha = s.opacity * twinkle;
    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  });
  ctx.restore();
}

let starsCache = null;
function buildStarsCache() {
  starsCache = Array.from({length: 90}, () => ({
    x: Math.random() * W,
    y: Math.random() * GROUND * 0.8,
    r: Math.random() < 0.15 ? 2 : 1,
    opacity: 0.2 + Math.random() * 0.7,
    freq: 0.5 + Math.random() * 3,
    phase: Math.random() * Math.PI * 2,
  }));
}

// ─── 3D PERSPECTIVE ROAD ───
let roadOffset = 0;

function drawRoad() {
  const vpX = W / 2;
  const vpY = GROUND * 0.72;  // vanishing point
  const roadWidthAtHorizon = W * 0.06;
  const roadWidthAtBottom  = W * 0.98;

  // Road fill
  const roadGrad = ctx.createLinearGradient(0, vpY, 0, H);
  roadGrad.addColorStop(0, '#18003a');
  roadGrad.addColorStop(0.3, '#200048');
  roadGrad.addColorStop(1, '#0d001e');
  ctx.beginPath();
  ctx.moveTo(vpX - roadWidthAtHorizon / 2, vpY);
  ctx.lineTo(vpX + roadWidthAtHorizon / 2, vpY);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = roadGrad;
  ctx.fill();

  // Lane lines (perspective dashes)
  const laneCount = 4;
  for (let lane = 1; lane < laneCount; lane++) {
    const frac = lane / laneCount;
    const xHorizon = vpX - roadWidthAtHorizon / 2 + roadWidthAtHorizon * frac;
    const xBottom  = frac * roadWidthAtBottom + (W - roadWidthAtBottom) / 2;

    // Draw dashes along the lane line
    const dashCount = 12;
    for (let d = 0; d < dashCount; d++) {
      const t0 = (d / dashCount + roadOffset * 0.0012) % (1 / dashCount) * dashCount;
      // We parametrize along the projected line
      for (let step = 0; step < 2; step++) {
        const ta = ((d + step * 0.4) / dashCount + roadOffset * 0.001) % 1;
        const tb = ((d + step * 0.4 + 0.18) / dashCount + roadOffset * 0.001) % 1;
        const xa = lerp(xHorizon, xBottom, ta);
        const ya = lerp(vpY, H, ta);
        const xb = lerp(xHorizon, xBottom, tb);
        const yb = lerp(vpY, H, tb);
        const alpha = ta * 0.55;
        const lineW = ta * 3;
        ctx.beginPath();
        ctx.moveTo(xa, ya); ctx.lineTo(xb, yb);
        ctx.strokeStyle = `rgba(192,96,255,${alpha})`;
        ctx.lineWidth = lineW;
        ctx.stroke();
      }
    }
  }

  // Road edges (bright rails)
  const railGrad = ctx.createLinearGradient(0, vpY, 0, H);
  railGrad.addColorStop(0, 'rgba(192,96,255,0)');
  railGrad.addColorStop(1, 'rgba(192,96,255,0.7)');
  [
    [vpX - roadWidthAtHorizon / 2, vpY, (W - roadWidthAtBottom) / 2, H],
    [vpX + roadWidthAtHorizon / 2, vpY, W - (W - roadWidthAtBottom) / 2, H],
  ].forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = railGrad;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  });

  // Ground glow strip
  const glowGrad = ctx.createLinearGradient(0, GROUND - 30, 0, GROUND + 40);
  glowGrad.addColorStop(0, 'rgba(160,60,255,0.25)');
  glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, GROUND - 30, W, 70);
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ═══════════════════════════════════════════════
//  PLAYER
// ═══════════════════════════════════════════════
let player;

function createPlayer() {
  const pw = Math.min(W * 0.13, 130);
  const ph = pw * 0.49;
  return {
    x:        W * 0.12,
    w:        pw,
    h:        ph,
    groundY:  GROUND - ph,
    y:        GROUND - ph,
    vy:       0,
    jumping:  false,
    jumps:    0,      // tracks multi-jump
    ducking:  false,
    duckH:    ph * 0.55,
    normalH:  ph,
    scaleX:   1,      // for squash/stretch
    scaleY:   1,
  };
}

function updatePlayer(dt) {
  // ── Horizontal movement (forward / backward) ──
  const moveSpeed = 300; // px/s
  const movingLeft  = keys['ArrowLeft']  || keys['KeyA'];
  const movingRight = keys['ArrowRight'] || keys['KeyD'];

  if (movingRight) player.x += moveSpeed * dt;
  if (movingLeft)  player.x -= moveSpeed * dt;

  // Clamp so dragon stays on screen
  player.x = Math.max(10, Math.min(W - player.w - 10, player.x));

  // Step timer ticks when moving sideways too (animate legs)
  if (movingLeft || movingRight) game.stepTimer += dt;

  // Gravity
  player.vy += C.GRAVITY * dt;
  player.y  += player.vy * dt;

  // Use normalH as the stable ground anchor so ducking doesn't shift landing
  const landingY = GROUND - player.normalH;
  player.groundY = landingY;

  // Land
  if (player.y >= landingY) {
    player.y  = landingY;
    player.vy = 0;
    if (player.jumping) {
      // Landing squash
      player.scaleX = 1.25; player.scaleY = 0.75;
      spawnDust(player.x + player.w / 2, GROUND);
    }
    player.jumping = false;
    player.jumps   = 0;
  }

  // Duck height lerp (visual only — doesn't affect groundY)
  const targetH = player.ducking ? player.duckH : player.normalH;
  player.h = lerp(player.h, targetH, 0.35);

  // Squash/stretch recovery
  player.scaleX = lerp(player.scaleX, 1, 0.2);
  player.scaleY = lerp(player.scaleY, 1, 0.2);

  // Running animation step clock (when on ground and not moving sideways it still ticks from auto-run)
  if (!player.jumping && !movingLeft && !movingRight) {
    game.stepTimer += dt;
  }
  // drawY: on ground use normalH to anchor bottom to GROUND correctly
  player.drawY = player.y;
}

function doJump() {
  const maxJumps = game.level >= C.DOUBLE_JUMP_LV ? 2 : 1;
  if (player.jumps < maxJumps) {
    player.vy = C.JUMP_FORCE * (player.jumps === 0 ? 1 : 0.75);
    player.jumping = true;
    player.jumps++;
    player.ducking = false;
    player.scaleX = 0.75; player.scaleY = 1.3;  // launch stretch
    // Grace period: skip collision for first 0.2s after jump so the player
    // isn't killed the moment they leave the ground beside an obstacle
    game.jumpGrace = C.JUMP_GRACE;
    SFX_JUMP();
    spawnDust(player.x + player.w / 2, GROUND, true);
  }
}

function drawPlayer() {
  if (!game.showPlayer) return;

  const drawW = player.w;
  const drawH = player.ducking ? player.duckH : player.normalH;

  // ── Correct sprite position from physics ──
  // player.y is the TOP of the player in physics space.
  // When ducking on ground: player.y = GROUND - normalH, but we want the
  // sprite bottom at GROUND so shift up by (normalH - duckH).
  let spriteTopY;
  if (!player.jumping && player.ducking) {
    spriteTopY = GROUND - drawH;  // anchor duck sprite bottom to GROUND
  } else {
    spriteTopY = player.y;         // use real physics position (rises on jump!)
  }
  const cx = player.x + drawW / 2;
  const cy = spriteTopY + drawH / 2;  // centre of sprite

  // Running step phase (0-1 loop)
  const stepPhase = (game.stepTimer * 6) % 1;       // 6 cycles per second
  const stepSin   = Math.sin(stepPhase * Math.PI * 2);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(player.scaleX, player.scaleY);

  // Slight body tilt: lean forward when running, tilt back on jump
  if (player.jumping) {
    ctx.rotate(-0.15);  // lean forward on jump
  } else {
    ctx.rotate(stepSin * 0.05);  // gentle sway while running
  }

  // Glow aura (invincibility)
  if (game.invincible) {
    const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, drawW * 0.65);
    glow.addColorStop(0, 'rgba(0,229,255,0.4)');
    glow.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-drawW * 0.65, -drawH * 0.65, drawW * 1.3, drawH * 1.3);
  }

  // ── Body / sprite ──
  if (IMG.player && IMG.player.width > 0) {
    ctx.drawImage(IMG.player, -drawW / 2, -drawH / 2, drawW, drawH);
  } else {
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.roundRect(-drawW / 2, -drawH / 2, drawW, drawH, 8);
    ctx.fill();
  }

  // ── Animated legs (running effect drawn on top) ──
  if (!player.jumping) {
    const legW  = drawW * 0.18;
    const legH  = drawH * 0.28;
    const legY  = drawH / 2 - legH * 0.3;   // attach at bottom of body
    const leg1X = -drawW * 0.18;
    const leg2X =  drawW * 0.18;
    // Legs alternate: one up, one down
    const lift1 =  stepSin * legH * 0.7;
    const lift2 = -stepSin * legH * 0.7;

    ctx.fillStyle = 'rgba(0, 200, 255, 0.75)';
    // Left leg
    ctx.save();
    ctx.translate(leg1X, legY + lift1);
    ctx.beginPath();
    ctx.ellipse(0, 0, legW / 2, legH / 2, stepSin * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Right leg
    ctx.save();
    ctx.translate(leg2X, legY + lift2);
    ctx.beginPath();
    ctx.ellipse(0, 0, legW / 2, legH / 2, -stepSin * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // In-air: draw tucked legs
    ctx.fillStyle = 'rgba(0,200,255,0.6)';
    ctx.save();
    ctx.translate(0, drawH * 0.28);
    ctx.scale(1.2, 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, drawW * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Wing flutter ──
  const wingFlap = player.jumping
    ? Math.sin(Date.now() * 0.025) * 0.45   // fast flap in air
    : Math.sin(game.stepTimer * 4 * Math.PI * 2) * 0.15; // slow idle

  ctx.save();
  ctx.translate(-drawW * 0.1, -drawH * 0.05);
  ctx.rotate(-0.4 + wingFlap);
  ctx.fillStyle = 'rgba(160, 80, 255, 0.55)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-drawW * 0.55, -drawH * 0.35);
  ctx.lineTo(-drawW * 0.1,   drawH * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// ═══════════════════════════════════════════════
//  OBSTACLES (HURDLES)
// ═══════════════════════════════════════════════
/**
 * Types:
 *   LOW    — sits on ground, must JUMP over
 *   HIGH   — floats at mid height, must DUCK under
 *   FLYING — higher up, jump at apex to dodge
 *   PAIR   — two stacked obstacles (jump or duck between gap)
 */
const OBSTACLE_TYPES = ['LOW', 'LOW', 'LOW', 'HIGH', 'FLYING'];

let obstacles = [];
let nextObstacleIn = 0; // px of travel before next spawn
let totalTravel    = 0;
let passedCount    = 0;

function obstacleWidth()  { return Math.min(W * 0.1, 110); }
function obstacleHeight() { return Math.min(W * 0.075, 80); }

function spawnObstacle() {
  const ow = obstacleWidth();
  const oh = obstacleHeight();
  // Available types based on level
  const available = OBSTACLE_TYPES.slice(0, Math.min(2 + game.level, OBSTACLE_TYPES.length));
  const type = available[Math.floor(Math.random() * available.length)];

  // Compute SCALED dimensions first so y is correct (avoids under/over-shoot)
  const scale  = 0.8 + Math.random() * 0.4;
  const finalW = ow * scale;
  const finalH = oh * scale;

  // y is TOP of obstacle; use SCALED height so bottom aligns with GROUND
  let y;
  if (type === 'LOW')         y = GROUND - finalH;
  else if (type === 'HIGH')   y = GROUND - finalH * 2.8;
  else if (type === 'FLYING') y = GROUND - finalH * 4;
  else                        y = GROUND - finalH;

  obstacles.push({
    x: W + 60,
    y,
    w: finalW,
    h: finalH,
    type,
    passed: false,
    scale,
    wobble: Math.random() * Math.PI * 2,
  });
}

function updateObstacles(dt) {
  totalTravel += game.speed * dt;
  nextObstacleIn -= game.speed * dt;
  if (nextObstacleIn <= 0) {
    spawnObstacle();
    // Gap scales with speed (higher speed = less time but same px min)
    const gap = C.MIN_OBSTACLE_GAP + (Math.random() * 0.5 * W);
    nextObstacleIn = gap;
  }

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.x -= game.speed * dt;
    o.wobble += dt * 2;

    // Score when passed
    if (!o.passed && o.x + o.w < player.x) {
      o.passed = true;
      passedCount++;
      awardScore();
      SFX_SCORE();
    }

    // Remove off-screen
    if (o.x + o.w < -60) {
      obstacles.splice(i, 1);
    }
  }
}

function drawObstacles() {
  obstacles.forEach(o => {
    const wobbleY = Math.sin(o.wobble) * (o.type === 'FLYING' ? 8 : 2);
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2 + wobbleY;

    ctx.save();
    ctx.translate(cx, cy);

    // Fiery glow for obstacles
    const glowColor = o.type === 'HIGH' ? '255,100,60' : o.type === 'FLYING' ? '255,220,0' : '255,60,100';
    const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, o.w * 0.7);
    glow.addColorStop(0, `rgba(${glowColor},0.3)`);
    glow.addColorStop(1, `rgba(${glowColor},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(-o.w * 0.7, -o.h * 0.7, o.w * 1.4, o.h * 1.4);

    if (IMG.dragon && IMG.dragon.width > 0) {
      ctx.drawImage(IMG.dragon, -o.w / 2, -o.h / 2, o.w, o.h);
    } else {
      ctx.fillStyle = `rgba(${glowColor}, 0.8)`;
      ctx.beginPath();
      ctx.roundRect(-o.w / 2, -o.h / 2, o.w, o.h, 6);
      ctx.fill();
    }

    // Type indicator
    const label = { LOW: '🔴', HIGH: '🟡 DUCK', FLYING: '🟠 JUMP' }[o.type];
    if (label) {
      ctx.font = `bold ${Math.max(10, o.w * 0.25)}px Exo\\ 2, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(o.type !== 'LOW' ? o.type : '', 0, -o.h / 2 - 10);
    }

    ctx.restore();
  });
}

// ═══════════════════════════════════════════════
//  COLLISION
// ═══════════════════════════════════════════════
function checkCollisions() {
  // Skip if invincible OR if just jumped (grace period)
  if (game.invincible || game.jumpGrace > 0) return;

  // Large margin = smaller effective hitbox = fairer collisions
  const margin = 24;
  const px = player.x + margin;
  // Use player.y directly (consistent with physics, avoids drawY offset confusion)
  const py = player.y + margin;
  const pw = player.w - margin * 2;
  // Use normalH for hitbox height so ducking visual doesn't mislead
  const ph = player.normalH - margin * 2;

  for (const o of obstacles) {
    // Obstacle hitbox: generous inset too
    const omx = margin * 0.75;
    const ox = o.x + omx;
    const oy = o.y + omx;
    const ow = o.w - omx * 2;
    const oh = o.h - omx * 2;

    if (px < ox + ow && px + pw > ox && py < oy + oh && py + ph > oy) {
      onHit();
      return;
    }
  }
}

function onHit() {
  SFX_HIT();
  game.lives--;
  game.combo = 1;
  game.comboTimer = 0;
  updateComboUI();

  // Spawn fire particles at collision
  const nearObs = obstacles.find(o => o.x < player.x + player.w && o.x + o.w > player.x);
  if (nearObs) {
    spawnFireBurst(nearObs.x + nearObs.w / 2, nearObs.y + nearObs.h / 2);
  }

  // Flash overlay
  const flash = document.getElementById('flashOverlay');
  flash.classList.remove('flash');
  void flash.offsetWidth;
  flash.classList.add('flash');

  updateLivesUI();

  if (game.lives <= 0) {
    gameOver();
  } else {
    // Invincibility frames
    game.invincible  = true;
    game.invincTimer = C.INVINCIBLE_MS;
    game.blinkTimer  = 0;
    game.showPlayer  = true;
  }
}

// ═══════════════════════════════════════════════
//  PARTICLES
// ═══════════════════════════════════════════════
let particles = [];

function spawnDust(x, y, jump = false) {
  const count = jump ? 8 : 4;
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 180,
      vy: -Math.random() * (jump ? 200 : 100) - 40,
      r: 3 + Math.random() * 5,
      alpha: 0.7,
      color: jump ? `hsl(270,60%,70%)` : `hsl(${250+Math.random()*30},40%,55%)`,
      decay: 0.025 + Math.random() * 0.02,
      type: 'dust',
    });
  }
}

function spawnFireBurst(x, y) {
  for (let i = 0; i < 30; i++) {
    const angle = (Math.PI * 2 * i) / 30 + Math.random() * 0.5;
    const speed = 80 + Math.random() * 280;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 100,
      r: 4 + Math.random() * 8,
      alpha: 0.9,
      color: `hsl(${10 + Math.random() * 40},100%,${55 + Math.random() * 25}%)`,
      decay: 0.03 + Math.random() * 0.04,
      type: 'fire',
    });
  }
}

function spawnScorePopup(x, y, text) {
  particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 40,
    vy: -90,
    text,
    alpha: 1,
    decay: 0.018,
    type: 'text',
    size: 16 + (game.combo > 2 ? game.combo * 3 : 0),
  });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.type !== 'text') {
      p.vy += 200 * dt; // gravity on particles
    }
    p.alpha -= p.decay;
    if (p.alpha <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    if (p.type === 'text') {
      ctx.font = `bold ${p.size}px 'Exo 2', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = game.combo > 1 ? '#ffd700' : '#00e5ff';
      ctx.shadowColor = game.combo > 1 ? '#ffd700' : '#00e5ff';
      ctx.shadowBlur = 8;
      ctx.fillText(p.text, p.x, p.y);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

// ═══════════════════════════════════════════════
//  SCORING
// ═══════════════════════════════════════════════
function awardScore() {
  const pts = C.SCORE_PER_OBS * game.combo;
  game.score += pts;

  // Spawn popup near passed obstacle
  const nearX = player.x + player.w + 30;
  spawnScorePopup(nearX, player.y - 20, `+${pts}${game.combo > 1 ? ' ×' + game.combo : ''}`);

  // Update combo
  game.combo = Math.min(game.combo + 1, 8);
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  game.comboTimer = C.COMBO_TIMEOUT;
  updateComboUI();

  if (game.combo > 1) SFX_COMBO();

  checkLevelUp();
  updateScoreUI();
}

function tickDistanceScore() {
  game.score += 1;
  checkLevelUp();
  updateScoreUI();
}

function checkLevelUp() {
  const newLevel = Math.floor(game.score / C.LEVEL_SCORE) + 1;
  if (newLevel > game.level) {
    game.level = newLevel;
    game.speed  = Math.min(C.BASE_SPEED + (game.level - 1) * C.SPEED_INC, C.MAX_SPEED);
    document.getElementById('levelVal').textContent = game.level;
    spawnLevelUpEffect();
  }
}

function spawnLevelUpEffect() {
  for (let i = 0; i < 20; i++) {
    const angle = (Math.PI * 2 * i) / 20;
    particles.push({
      x: W / 2, y: H / 2,
      vx: Math.cos(angle) * (100 + Math.random() * 150),
      vy: Math.sin(angle) * (100 + Math.random() * 150) - 80,
      r: 4 + Math.random() * 6,
      alpha: 0.85,
      color: `hsl(${280 + Math.random() * 60},80%,${60 + Math.random() * 30}%)`,
      decay: 0.018,
      type: 'fire',
    });
  }
}

// ═══════════════════════════════════════════════
//  UI UPDATES
// ═══════════════════════════════════════════════
function updateScoreUI() {
  document.getElementById('scoreVal').textContent = game.score;
}

function updateLivesUI() {
  const el = document.getElementById('livesDisplay');
  el.innerHTML = '';
  for (let i = 0; i < C.LIVES_MAX; i++) {
    const span = document.createElement('span');
    span.className = 'life-icon' + (i >= game.lives ? ' lost' : '');
    span.textContent = '🐉';
    el.appendChild(span);
  }
}

function updateComboUI() {
  const el = document.getElementById('comboDisplay');
  if (game.combo > 1) {
    el.classList.remove('hidden');
    document.getElementById('comboText').textContent = `×${game.combo} COMBO`;
    el.classList.remove('hidden');
    // Trigger re-animation
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  } else {
    el.classList.add('hidden');
  }
}

function updateHighScoreUI() {
  document.getElementById('highScoreVal').textContent = game.highScore;
  document.getElementById('menuHighScore').textContent = game.highScore;
}

// ═══════════════════════════════════════════════
//  GAME STATES
// ═══════════════════════════════════════════════
function resetGame() {
  game.score       = 0;
  game.level       = 1;
  game.speed       = C.BASE_SPEED;
  game.lives       = C.LIVES_MAX;
  game.combo       = 1;
  game.maxCombo    = 1;
  game.comboTimer  = 0;
  game.invincible  = false;
  game.invincTimer = 0;
  game.showPlayer  = true;
  game.newHighScore = false;
  game.scoreTick   = 0;
  obstacles    = [];
  particles    = [];
  passedCount  = 0;
  totalTravel  = 0;
  nextObstacleIn = 800;
  roadOffset   = 0;
  player       = createPlayer();
  updateScoreUI();
  updateLivesUI();
  updateComboUI();
  document.getElementById('levelVal').textContent  = '1';
  document.getElementById('comboDisplay').classList.add('hidden');
}

// Countdown before play
function startCountdown(callback) {
  showScreen('countdown');
  let count = 3;
  const el = document.getElementById('countdownNum');

  function tick() {
    el.textContent = count;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'countPop 0.5s ease-out';

    if (count === 0) {
      setTimeout(() => {
        hideScreen('countdown');
        callback();
      }, 400);
      return;
    }
    count--;
    setTimeout(tick, 700);
  }
  tick();
}

function startGame() {
  resetGame();
  showScreen('game');
  startCountdown(() => {
    STATE = 'PLAYING';
    playBg();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  });
}

function pauseGame() {
  if (STATE !== 'PLAYING') return;
  STATE = 'PAUSED';
  pauseBg();
  showScreen('pause');
}

function resumeGame() {
  STATE = 'PLAYING';
  resumeBg();
  hideScreen('pause');
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function gameOver() {
  STATE = 'GAMEOVER';
  stopBg();
  playGameover();

  // High score
  if (game.score > game.highScore) {
    game.highScore = game.score;
    game.newHighScore = true;
    localStorage.setItem('dragon_hs', game.highScore);
    updateHighScoreUI();
    spawnConfetti();
  }

  // Populate GO screen
  document.getElementById('goScore').textContent     = game.score;
  document.getElementById('goHighScore').textContent = game.highScore;
  document.getElementById('goLevel').textContent     = game.level;
  document.getElementById('goCombo').textContent     = `×${game.maxCombo}`;
  const badge = document.getElementById('newHighScoreBadge');
  if (game.newHighScore) badge.classList.remove('hidden');
  else badge.classList.add('hidden');

  setTimeout(() => showScreen('gameover'), 600);
}

function toMenu() {
  STATE = 'MENU';
  stopBg();
  obstacles    = [];
  particles    = [];
  hideScreen('game');
  hideScreen('pause');
  hideScreen('gameover');
  showScreen('menu');
}

function spawnConfetti() {
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * W,
      y: -20,
      vx: (Math.random() - 0.5) * 120,
      vy: 100 + Math.random() * 200,
      r: 5 + Math.random() * 5,
      alpha: 1,
      color: `hsl(${Math.random() * 360},90%,60%)`,
      decay: 0.005,
      type: 'fire',
    });
  }
}

// ─── Screen helpers ───
function showScreen(name) {
  const map = {
    menu:      'menuScreen',
    countdown: 'countdownScreen',
    game:      'gameScreen',
    pause:     'pauseScreen',
    gameover:  'gameOverScreen',
  };
  const el = document.getElementById(map[name]);
  if (el) { el.style.display = 'flex'; el.classList.add('active'); }
}
function hideScreen(name) {
  const map = {
    menu:      'menuScreen',
    countdown: 'countdownScreen',
    game:      'gameScreen',
    pause:     'pauseScreen',
    gameover:  'gameOverScreen',
  };
  const el = document.getElementById(map[name]);
  if (el) { el.style.display = 'none'; el.classList.remove('active'); }
}

// ═══════════════════════════════════════════════
//  MAIN GAME LOOP
// ═══════════════════════════════════════════════
let lastTime = 0;

function gameLoop(ts) {
  if (STATE !== 'PLAYING') return;

  const dt = Math.min((ts - lastTime) / 1000, 0.05); // cap dt to 50ms
  lastTime = ts;

  // ── Update ──
  roadOffset += game.speed * dt;

  // Distance tick score
  game.scoreTick += dt * 1000;
  if (game.scoreTick >= C.SCORE_TICK_MS) {
    game.scoreTick -= C.SCORE_TICK_MS;
    tickDistanceScore();
  }

  // Combo timeout
  if (game.combo > 1) {
    game.comboTimer -= dt * 1000;
    if (game.comboTimer <= 0) {
      game.combo = 1;
      updateComboUI();
    }
  }

  // Jump grace countdown (no collision right after jump starts)
  if (game.jumpGrace > 0) {
    game.jumpGrace = Math.max(0, game.jumpGrace - dt);
  }

  // Invincibility
  if (game.invincible) {
    game.invincTimer -= dt * 1000;
    game.blinkTimer  -= dt * 1000;
    if (game.blinkTimer <= 0) {
      game.showPlayer  = !game.showPlayer;
      game.blinkTimer  = C.INVINC_BLINK;
    }
    if (game.invincTimer <= 0) {
      game.invincible = false;
      game.showPlayer = true;
    }
  }

  updatePlayer(dt);
  updateObstacles(dt);
  updateParticles(dt);
  checkCollisions();

  // ── Draw ──
  ctx.clearRect(0, 0, W, H);
  drawSky();
  drawStars(ts / 1000);
  layers.forEach(l => { l.offset += game.speed * dt; l.draw(l.offset); });
  drawRoad();
  drawObstacles();
  drawPlayer();
  drawParticles();

  requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════════════
//  CONTROLS
// ═══════════════════════════════════════════════
let keys = {};

document.addEventListener('keydown', e => {
  if (keys[e.code]) return; // prevent repeat
  keys[e.code] = true;

  if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
    e.preventDefault();
    if (STATE === 'PLAYING') doJump();
    else if (STATE === 'MENU') document.getElementById('startBtn').click();
    else if (STATE === 'GAMEOVER') document.getElementById('restartBtn').click();
  }

  if (['ArrowDown', 'KeyS'].includes(e.code)) {
    e.preventDefault();
    if (STATE === 'PLAYING') player.ducking = true;
  }

  if (e.code === 'KeyP') {
    if (STATE === 'PLAYING') pauseGame();
    else if (STATE === 'PAUSED') resumeGame();
  }

  if (e.code === 'KeyR' && STATE === 'GAMEOVER') {
    document.getElementById('restartBtn').click();
  }
});

document.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (['ArrowDown', 'KeyS'].includes(e.code) && STATE === 'PLAYING') {
    player.ducking = false;
  }
});

// Touch controls
let touchStartY = 0;
let touchStartX = 0;

document.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
  // Resume audio context on first touch
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}, { passive: true });

document.addEventListener('touchend', e => {
  const dy = touchStartY - e.changedTouches[0].clientY;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dy) > 40) {
    if (dy > 0 && STATE === 'PLAYING') doJump();           // swipe up
    if (dy < 0 && STATE === 'PLAYING') player.ducking = false; // swipe down release
  }
}, { passive: true });

document.addEventListener('touchmove', e => {
  const dy = touchStartY - e.touches[0].clientY;
  if (dy < -30 && STATE === 'PLAYING') player.ducking = true;
}, { passive: true });

// Mobile buttons
document.getElementById('mobJumpBtn').addEventListener('touchstart', e => {
  e.stopPropagation();
  if (STATE === 'PLAYING') doJump();
}, { passive: true });

document.getElementById('mobDuckBtn').addEventListener('touchstart', e => {
  e.stopPropagation();
  if (STATE === 'PLAYING') player.ducking = true;
}, { passive: true });

document.getElementById('mobDuckBtn').addEventListener('touchend', e => {
  e.stopPropagation();
  if (STATE === 'PLAYING') player.ducking = false;
}, { passive: true });

// ─── UI Buttons ───
document.getElementById('startBtn').addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  hideScreen('menu');
  startGame();
});

document.getElementById('restartBtn').addEventListener('click', () => {
  hideScreen('gameover');
  startGame();
});

document.getElementById('resumeBtn').addEventListener('click', resumeGame);

document.getElementById('pauseRestartBtn').addEventListener('click', () => {
  hideScreen('pause');
  startGame();
});

document.getElementById('pauseMenuBtn').addEventListener('click', () => {
  hideScreen('pause');
  toMenu();
});

document.getElementById('goMenuBtn').addEventListener('click', () => {
  hideScreen('gameover');
  toMenu();
});

document.getElementById('pauseBtn').addEventListener('click', () => {
  if (STATE === 'PLAYING') pauseGame();
  else if (STATE === 'PAUSED') resumeGame();
});

document.getElementById('muteBtn').addEventListener('click', () => {
  game.muted = !game.muted;
  localStorage.setItem('dragon_mute', game.muted ? '1' : '0');
  document.getElementById('muteBtn').textContent = game.muted ? '🔇' : '🔊';
  if (game.muted) bgMusic.pause();
  else if (STATE === 'PLAYING') bgMusic.play().catch(() => {});
});

// ═══════════════════════════════════════════════
//  MENU PARTICLES
// ═══════════════════════════════════════════════
function buildMenuParticles() {
  const container = document.getElementById('menuParticles');
  container.innerHTML = '';
  for (let i = 0; i < 22; i++) {
    const span = document.createElement('span');
    const size = 8 + Math.random() * 60;
    span.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      top:${60 + Math.random() * 40}%;
      --dur:${6 + Math.random() * 10}s;
      --del:${-Math.random() * 12}s;
    `;
    container.appendChild(span);
  }
}

// ═══════════════════════════════════════════════
//  PWA SERVICE WORKER
// ═══════════════════════════════════════════════
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
async function init() {
  resize();
  await loadImages();
  initAudio();
  initBgData();
  buildMenuParticles();
  updateHighScoreUI();

  // Set mute button state
  document.getElementById('muteBtn').textContent = game.muted ? '🔇' : '🔊';

  // Init lives
  updateLivesUI();

  // Show menu
  showScreen('menu');

  // Animate menu canvas (stars only)
  function animateMenu(ts) {
    if (STATE !== 'MENU') return;
    ctx.clearRect(0, 0, W, H);
    drawSky();
    drawStars(ts / 1000);
    requestAnimationFrame(animateMenu);
  }
  requestAnimationFrame(animateMenu);

  registerSW();
}

init();
