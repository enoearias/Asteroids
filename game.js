'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', e => {
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño
const ASTEROID_COLORS = [null, '#5e4e40', '#4f4236', '#43372c'];  // sombra por tamaño
const ASTEROID_LIGHT  = [null, '#a8927a', '#98836c', '#8a7560'];  // zona iluminada

// Contorno del asteroide grande (de la imagen), normalizado a radio 1
const LARGE_SHAPE = [
  [-0.05, -1.00], [ 0.50, -0.82], [ 0.39, -0.20], [ 0.98, -0.03],
  [ 0.81,  0.61], [ 0.30,  0.60], [ 0.06,  1.00], [-0.65,  0.65],
  [-0.99,  0.06], [-0.84, -0.59],
];

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Grande: forma fija trazada de la imagen; resto: polígono irregular
    this.verts = [];
    if (size === 3) {
      this.verts = LARGE_SHAPE.map(([vx, vy]) => [vx * this.radius, vy * this.radius]);
      return;
    }
    const n = randInt(8, 13);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.beginPath();
    for (let i = 0; i < this.verts.length; i++) {
      // Rotar a mano para que la luz (gradiente) quede fija arriba-izquierda
      const [vx, vy] = this.verts[i];
      const c = Math.cos(this.rot), s = Math.sin(this.rot);
      ctx.lineTo(vx * c - vy * s, vx * s + vy * c);
    }
    ctx.closePath();
    // Relleno sólido con gradiente para dar volumen
    const r = this.radius;
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, ASTEROID_LIGHT[this.size]);
    g.addColorStop(1, ASTEROID_COLORS[this.size]);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#b9a68f';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() { this.reset(); }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.dead          = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;

    // Hiperpropulsión: más aceleración, velocidad máxima y giro
    const hyper  = hyperTimer > 0;
    const ROT    = hyper ? 5   : 3.5;    // rad/s
    const THRUST = hyper ? 600 : 260;    // px/s²
    const DRAG   = hyper ? 0.995 : 0.987;

    this.turning = 0;
    if (keys['ArrowLeft'])  { this.angle -= ROT * dt; this.turning = -1; }
    if (keys['ArrowRight']) { this.angle += ROT * dt; this.turning =  1; }

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    // Disparo triple: tres balas en abanico
    if (tripleShotTimer > 0) {
      const SPREAD = 0.25;
      return [-SPREAD, 0, SPREAD].map(d => new Bullet(ox, oy, this.angle + d));
    }
    return [new Bullet(ox, oy, this.angle)];
  }

  draw() {
    if (this.dead) return;
    // Escudo: círculo de energía (parpadea en el último segundo)
    if (shieldTimer > 0 && !(shieldTimer < 1 && Math.floor(shieldTimer * 8) % 2 === 0)) {
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Llama del propulsor (detrás del casco)
    if (this.thrusting && Math.random() > 0.25) {
      const len = hyperTimer > 0 ? rand(16, 28) : rand(6, 14);
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - len, 0);
      ctx.lineTo(-8,  4);
      ctx.closePath();
      ctx.fillStyle = hyperTimer > 0 ? 'rgba(255, 90, 0, 0.9)' : 'rgba(255, 160, 0, 0.85)';
      ctx.fill();
    }

    // Alabeo al girar: el casco se "inclina" (escala en Y)
    if (this.turning) ctx.scale(1, 0.85);

    // Casco pseudo-3D: dos facetas a lo largo del eje central
    ctx.lineJoin = 'round';
    // Faceta superior (iluminada)
    let g = ctx.createLinearGradient(0, -9, 0, 0);
    g.addColorStop(0, '#e0e6f0');
    g.addColorStop(1, '#8a96a8');
    ctx.beginPath();
    ctx.moveTo( 20,  0);
    ctx.lineTo(-12, -9);
    ctx.lineTo( -7,  0);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    // Faceta inferior (en sombra)
    g = ctx.createLinearGradient(0, 0, 0, 9);
    g.addColorStop(0, '#5a6578');
    g.addColorStop(1, '#2c3442');
    ctx.beginPath();
    ctx.moveTo( 20,  0);
    ctx.lineTo( -7,  0);
    ctx.lineTo(-12,  9);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    // Contorno
    ctx.beginPath();
    ctx.moveTo( 20,  0);
    ctx.lineTo(-12, -9);
    ctx.lineTo( -7,  0);
    ctx.lineTo(-12,  9);
    ctx.closePath();
    ctx.strokeStyle = '#f0f4ff';
    ctx.lineWidth   = 1;
    ctx.stroke();
    // Cabina con brillo
    ctx.beginPath();
    ctx.ellipse(6, 0, 4.5, 2.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1fb6d6';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(7, -0.9, 1.6, 0.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d8fbff';
    ctx.fill();

    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Power-ups ─────────────────────────────────────────────────────────────────
// Tipos: triple (disparo triple), shield (escudo), slow (cámara lenta),
//        hyper (hiperpropulsión), nova (bomba nova, un solo uso con tecla B)
const POWERUP_STYLE = {
  triple: { color: '#0ff', label: '3' },
  shield: { color: '#0f0', label: 'E' },
  slow:   { color: '#ff0', label: 'S' },
  hyper:  { color: '#f80', label: 'H' },
  nova:   { color: '#f0f', label: 'N' },
};
// Rango [min, max] del n-ésimo asteroide destruido que suelta cada tipo
// (la nova sale más tarde: ítem escaso)
const DROP_RANGES = {
  triple: [4, 15],
  shield: [4, 15],
  slow:   [6, 20],
  hyper:  [6, 20],
  nova:   [15, 30],
};

class PowerUp {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    const angle = rand(0, Math.PI * 2);
    this.vx = Math.cos(angle) * 25;
    this.vy = Math.sin(angle) * 25;
    this.radius = 20;
    this.ttl  = 15;  // segundos antes de desaparecer
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    // Parpadeo en los últimos 2 segundos
    if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;
    const { color, label } = POWERUP_STYLE[this.type];
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 20px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, this.x, this.y + 2);
    ctx.textBaseline = 'alphabetic';
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles;
let score, lives, level;
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;
let powerUps = [];         // power-ups en pantalla
let drops;                 // { tipo: { at, spawned } } — cada tipo aparece una vez por partida
let asteroidsDestroyed;
let tripleShotTimer = 0;   // segundos restantes de disparo triple
let shieldTimer     = 0;   // segundos restantes de escudo
let slowTimer       = 0;   // segundos restantes de cámara lenta
let hyperTimer      = 0;   // segundos restantes de hiperpropulsión
let novaCharges     = 0;   // bombas nova disponibles (máx. 1)
let novaFlash       = 0;   // destello blanco tras detonar la nova

function resetPowers() {
  tripleShotTimer = shieldTimer = slowTimer = hyperTimer = 0;
  novaCharges = 0;
}

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function initGame() {
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  powerUps           = [];
  asteroidsDestroyed = 0;
  novaFlash          = 0;
  resetPowers();
  // Cada power-up sale de un asteroide distinto (n-ésimo destruido)
  drops = {};
  const used = new Set();
  for (const type in DROP_RANGES) {
    const [min, max] = DROP_RANGES[type];
    let at;
    do { at = randInt(min, max); } while (used.has(at));
    used.add(at);
    drops[type] = { at, spawned: false };
  }
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  ship.reset();
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  resetPowers();   // se pierden los power-ups al morir
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function updatePowerUps(dt) {
  powerUps.forEach(p => p.update(dt));
  powerUps = powerUps.filter(p => !p.dead);
}

// Activa el efecto de un power-up (al tocarlo con la nave o dispararle)
function collectPowerUp(p) {
  if (p.type === 'triple') tripleShotTimer = 10;
  if (p.type === 'shield') shieldTimer     = 5;
  if (p.type === 'slow')   slowTimer       = 6;
  if (p.type === 'hyper')  hyperTimer      = 8;
  if (p.type === 'nova')   novaCharges     = 1;
  explode(p.x, p.y, 10);
  p.dead = true;
}

// Bomba nova: destruye por completo todos los asteroides en pantalla
function detonateNova() {
  novaCharges = 0;
  novaFlash   = 0.3;
  for (const a of asteroids) destroyAsteroid(a, []);   // sin fragmentos
  asteroids = [];
}

// Velocidad de los asteroides (mitad con cámara lenta)
const asteroidDt = dt => slowTimer > 0 ? dt * 0.5 : dt;

// Destruye un asteroide: puntos, explosión, fragmentos y posible power-up
function destroyAsteroid(a, newAsteroids) {
  a.dead = true;
  score += POINTS[a.size];
  explode(a.x, a.y, a.size * 5);
  newAsteroids.push(...a.split());
  asteroidsDestroyed++;
  for (const type in drops) {
    const d = drops[type];
    if (!d.spawned && asteroidsDestroyed >= d.at) {
      powerUps.push(new PowerUp(a.x, a.y, type));
      d.spawned = true;
    }
  }
}

function update(dt) {
  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(asteroidDt(dt)));
    updatePowerUps(dt);
    if (novaFlash > 0) novaFlash -= dt;
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }
  // Detonar bomba nova
  if (pressed('KeyB') && novaCharges > 0) detonateNova();

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  asteroids.forEach(a => a.update(asteroidDt(dt)));
  particles.forEach(p => p.update(dt));
  updatePowerUps(dt);
  if (tripleShotTimer > 0) tripleShotTimer -= dt;
  if (shieldTimer     > 0) shieldTimer     -= dt;
  if (slowTimer       > 0) slowTimer       -= dt;
  if (hyperTimer      > 0) hyperTimer      -= dt;
  if (novaFlash       > 0) novaFlash       -= dt;

  bullets   = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        destroyAsteroid(a, newAsteroids);
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);

  // Bala vs power-up: dispararle también lo activa
  for (const b of bullets) {
    for (const p of powerUps) {
      if (!b.dead && !p.dead && dist(b, p) < p.radius) {
        b.dead = true;
        collectPowerUp(p);
      }
    }
  }
  bullets   = bullets.filter(b => !b.dead);

  // Nave recoge power-ups
  for (const p of powerUps) {
    if (!ship.dead && !p.dead && dist(ship, p) < ship.radius + p.radius)
      collectPowerUp(p);
  }
  powerUps = powerUps.filter(p => !p.dead);

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        if (shieldTimer > 0) {
          // El escudo absorbe el impacto y destruye el asteroide
          shieldTimer = 0;
          const frags = [];
          destroyAsteroid(a, frags);
          asteroids = asteroids.filter(x => !x.dead).concat(frags);
          ship.invincible = 1;   // margen para escapar de los fragmentos
        } else {
          killShip();
        }
        break;
      }
    }
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  ctx.textAlign = 'left';
  // Power-ups activos, uno por línea bajo el puntaje
  const active = [
    ['TRIPLE', tripleShotTimer, POWERUP_STYLE.triple.color],
    ['ESCUDO', shieldTimer,     POWERUP_STYLE.shield.color],
    ['LENTO',  slowTimer,       POWERUP_STYLE.slow.color],
    ['HIPER',  hyperTimer,      POWERUP_STYLE.hyper.color],
  ];
  let hudY = 48;
  for (const [label, t, color] of active) {
    if (t <= 0) continue;
    ctx.fillStyle = color;
    ctx.fillText(`${label} ${Math.ceil(t)}s`, 14, hudY);
    hudY += 22;
  }
  if (novaCharges > 0) {
    ctx.fillStyle = POWERUP_STYLE.nova.color;
    ctx.fillText('NOVA [B]', 14, hudY);
  }
}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  bullets.forEach(b => b.draw());
  powerUps.forEach(p => p.draw());
  ship.draw();

  // Destello de la bomba nova
  if (novaFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(novaFlash / 0.3 * 0.8).toFixed(2)})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
