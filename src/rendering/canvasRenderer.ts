import type { Direction, EatenKind, Point, PowerUpKind, RenderState as GameState, RendererConfig as GameConfig } from "./renderState.ts";

type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: string };
type FloatingText = { x: number; y: number; text: string; color: string; born: number };
type Ring = { x: number; y: number; color: string; born: number; maxRadius: number };
type Banner = { text: string; color: string; born: number };
type Star = { x: number; y: number; r: number; phase: number; speed: number };

type Palette = {
  snakeHue: [number, number];
  snakeSat: number;
  headLight: string;
  headDark: string;
  glow: string;
  food: [string, string, string];
  leaf: string | null;
  gold: [string, string, string];
  gem: [string, string, string];
  lucky: [string, string, string];
  obstacle: [string, string];
  obstacleEdge: string;
  hatch: boolean;
  eat: Record<EatenKind | PowerUpKind, string[]>;
};

const PALETTES: Record<"normal" | "colorblind", Palette> = {
  normal: {
    snakeHue: [152, 188],
    snakeSat: 90,
    headLight: "#d4ffe9",
    headDark: "#2ee6a0",
    glow: "80, 255, 190",
    food: ["#ffd6de", "#ff4d6d", "#b5173b"],
    leaf: "#52e3a0",
    gold: ["#fff3c4", "#ffd166", "#c77c02"],
    gem: ["#e0fbff", "#4cc9f0", "#7b2cbf"],
    lucky: ["#ffe9c2", "#ff9f1c", "#a85a00"],
    obstacle: ["#5a3d8f", "#231542"],
    obstacleEdge: "255, 77, 210",
    hatch: false,
    eat: {
      food: ["#ff4d6d", "#ff8fa3", "#ffd6de"],
      gold: ["#ffd166", "#ffb703", "#fff3c4"],
      gem: ["#4cc9f0", "#b8f2ff", "#9d4edd"],
      lucky: ["#ff9f1c", "#ffd08a", "#fff3c4"],
      slow: ["#7cc6ff", "#c8e7ff", "#4361ee"],
      ghost: ["#e0d4ff", "#b794ff", "#ffffff"],
    },
  },
  colorblind: {
    snakeHue: [200, 222],
    snakeSat: 85,
    headLight: "#e3f3ff",
    headDark: "#56b4e9",
    glow: "86, 180, 233",
    food: ["#ffe7b8", "#e69f00", "#9c6400"],
    leaf: null,
    gold: ["#fffbd0", "#f0e442", "#a89a00"],
    gem: ["#ffe3f2", "#cc79a7", "#7a2f5a"],
    lucky: ["#fff3c4", "#f0a000", "#7a4a00"],
    obstacle: ["#d55e00", "#6b2d00"],
    obstacleEdge: "255, 170, 110",
    hatch: true,
    eat: {
      food: ["#e69f00", "#ffd27a", "#ffffff"],
      gold: ["#f0e442", "#fffbd0", "#ffffff"],
      gem: ["#cc79a7", "#ffc4e4", "#ffffff"],
      lucky: ["#f0a000", "#ffe29a", "#ffffff"],
      slow: ["#56b4e9", "#d6ecff", "#ffffff"],
      ghost: ["#ffffff", "#bbbbbb", "#e3f3ff"],
    },
  },
};

export type Renderer = {
  /** `moved` is true only when a game tick advanced the snake, so the renderer can tween it. */
  update: (state: GameState, moved: boolean, tickMs: number) => void;
  banner: (text: string, color: string) => void;
  setColorblind: (enabled: boolean) => void;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const key = (p: Point) => `${p.x},${p.y}`;

export function sameSnakePositions(a: Point[], b: Point[]): boolean {
  return a.length === b.length && a.every((point, index) => point.x === b[index].x && point.y === b[index].y);
}

export function createRenderer(canvas: HTMLCanvasElement, config: GameConfig): Renderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not supported in this browser.");
  const g = ctx;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let palette = PALETTES.normal;
  let size = 0;
  let cell = 0;
  let prev: GameState | null = null;
  let curr: GameState | null = null;
  let moveStart = 0;
  let moveDuration = 1;
  let particles: Particle[] = [];
  let texts: FloatingText[] = [];
  let rings: Ring[] = [];
  let banners: Banner[] = [];
  let trail: Array<{ x: number; y: number; t: number }> = [];
  let deathBursts: Array<{ at: Point; when: number }> = [];
  const obstacleBorn = new Map<string, number>();
  let shakeUntil = 0;
  let shakeStrength = 0;
  let flash: { color: string; until: number; duration: number } | null = null;
  let deadAt = 0;
  let lastFrame = performance.now();
  let lastDraw = 0;
  const IDLE_FRAME_MS = 66;
  const stars: Star[] = Array.from({ length: 70 }, () => ({
    x: Math.random(), y: Math.random(), r: 0.4 + Math.random() * 1.1, phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 1.5,
  }));

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssSize = canvas.clientWidth;
    if (cssSize === 0) return;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = cssSize;
    cell = size / config.gridSize;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const center = (p: Point) => ({ x: (p.x + 0.5) * cell, y: (p.y + 0.5) * cell });

  function burst(at: Point, colors: string[], count: number, speed: number): void {
    if (reducedMotion) count = Math.ceil(count / 4);
    const c = center(at);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.35 + Math.random() * 0.65);
      particles.push({
        x: c.x, y: c.y,
        vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
        life: 0, maxLife: 450 + Math.random() * 500,
        size: cell * (0.07 + Math.random() * 0.1),
        color: colors[i % colors.length],
      });
    }
  }

  function ring(at: Point, color: string, maxCells: number, now: number): void {
    if (reducedMotion) return;
    const c = center(at);
    rings.push({ x: c.x, y: c.y, color, born: now, maxRadius: cell * maxCells });
  }

  function shake(strength: number, duration: number, now: number): void {
    if (reducedMotion) return;
    shakeStrength = strength;
    shakeUntil = now + duration;
  }

  function banner(text: string, color: string): void {
    banners = [{ text, color, born: performance.now() }];
  }

  function update(state: GameState, moved: boolean, tickMs: number): void {
    const now = performance.now();
    const previous = curr;

    if (!previous || state.status === "ready") {
      particles = [];
      texts = [];
      rings = [];
      trail = [];
      deathBursts = [];
      obstacleBorn.clear();
      deadAt = 0;
      state.obstacles.forEach((o, i) => obstacleBorn.set(key(o), now + i * 90));
    } else {
      state.obstacles.forEach((o) => {
        if (!obstacleBorn.has(key(o))) {
          obstacleBorn.set(key(o), now);
          burst(o, [`rgb(${palette.obstacleEdge})`, palette.obstacle[0]], 16, cell * 5);
          ring(o, `rgb(${palette.obstacleEdge})`, 2.2, now);
          shake(cell * 0.12, 180, now);
        }
      });
    }

    if (state.lastEaten && state.lastEaten !== previous?.lastEaten) {
      const eaten = state.lastEaten;
      const big = eaten.kind !== "food";
      const colors = palette.eat[eaten.kind];
      burst(eaten.at, colors, big ? 40 : 18, cell * (big ? 9 : 6));
      ring(eaten.at, colors[0], big ? 4 : 2.4, now);
      if (big) ring(eaten.at, colors[1], 6, now + 90);
      const c = center(eaten.at);
      texts.push({ x: c.x, y: c.y, text: eaten.kind === "lucky" ? "+1 PT" : eaten.combo > 1 ? `+${eaten.points} ×${eaten.combo}` : `+${eaten.points}`, color: colors[0], born: now });
      if (big) {
        flash = { color: colors[0], until: now + 260, duration: 260 };
        shake(cell * 0.15, 200, now);
      }
    }

    if (state.lastPowerUp && state.lastPowerUp !== previous?.lastPowerUp) {
      const colors = palette.eat[state.lastPowerUp.kind];
      burst(state.lastPowerUp.at, colors, 44, cell * 9);
      ring(state.lastPowerUp.at, colors[0], 8, now);
      flash = { color: colors[0], until: now + 320, duration: 320 };
    }

    if (state.status === "game_over" && previous?.status !== "game_over") {
      deadAt = now;
      shake(cell * 0.45, 500, now);
      flash = { color: "#ff1744", until: now + 420, duration: 420 };
      deathBursts = state.snake.map((segment, i) => ({ at: segment, when: now + i * 45 }));
      ring(state.snake[0], "#ff4d6d", 7, now);
    }

    if (moved && previous) {
      prev = previous;
      moveStart = now;
      moveDuration = tickMs;
    } else if (!previous || !sameSnakePositions(previous.snake, state.snake)) {
      prev = state;
    }
    curr = state;
  }

  function drawBackground(time: number, state: GameState): void {
    const bg = g.createRadialGradient(size / 2, size * 0.45, size * 0.05, size / 2, size / 2, size * 0.8);
    bg.addColorStop(0, "#1a1545");
    bg.addColorStop(1, "#06051a");
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);

    if (!reducedMotion) {
      for (const star of stars) {
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time / 1000 * star.speed + star.phase));
        const y = (star.y * size + time * 0.004 * star.speed) % size;
        g.fillStyle = `rgba(210, 220, 255, ${0.5 * twinkle})`;
        g.beginPath();
        g.arc(star.x * size, y, star.r, 0, Math.PI * 2);
        g.fill();
      }
    }

    for (let y = 0; y < config.gridSize; y += 1) {
      for (let x = 0; x < config.gridSize; x += 1) {
        if ((x + y) % 2 === 0) {
          g.fillStyle = "rgba(120, 110, 255, 0.04)";
          g.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    }
    g.fillStyle = "rgba(160, 150, 255, 0.12)";
    for (let y = 1; y < config.gridSize; y += 1) {
      for (let x = 1; x < config.gridSize; x += 1) {
        g.fillRect(x * cell - 0.75, y * cell - 0.75, 1.5, 1.5);
      }
    }

    const sweep = ((time / 4000) % 1) * (size + 200) - 100;
    const glow = g.createLinearGradient(0, sweep - 80, 0, sweep + 80);
    glow.addColorStop(0, `rgba(${palette.glow}, 0)`);
    glow.addColorStop(0.5, `rgba(${palette.glow}, 0.05)`);
    glow.addColorStop(1, `rgba(${palette.glow}, 0)`);
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);

    if (state.effects.slow > 0) {
      g.fillStyle = "rgba(60, 110, 255, 0.12)";
      g.fillRect(0, 0, size, size);
      if (!reducedMotion) {
        const head = center(state.snake[0]);
        for (let i = 0; i < 3; i += 1) {
          const phase = ((time / 1800) + i / 3) % 1;
          g.strokeStyle = `rgba(140, 190, 255, ${0.25 * (1 - phase)})`;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(head.x, head.y, phase * size * 0.6, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }
  }

  function drawObstacles(state: GameState, time: number): void {
    for (const o of state.obstacles) {
      const born = obstacleBorn.get(key(o)) ?? 0;
      const t = clamp01((time - born) / 420);
      if (t <= 0) continue;
      const scale = reducedMotion ? 1 : easeOutBack(t);
      const c = center(o);
      const s = cell * 0.86 * scale;
      g.save();
      g.translate(c.x, c.y);
      g.shadowColor = `rgba(${palette.obstacleEdge}, 0.8)`;
      g.shadowBlur = cell * 0.55;
      const body = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
      body.addColorStop(0, palette.obstacle[0]);
      body.addColorStop(1, palette.obstacle[1]);
      g.fillStyle = body;
      g.beginPath();
      g.roundRect(-s / 2, -s / 2, s, s, s * 0.22);
      g.fill();
      g.shadowBlur = 0;
      g.lineWidth = Math.max(1, cell * 0.06);
      g.strokeStyle = `rgba(${palette.obstacleEdge}, ${0.55 + 0.3 * Math.sin(time / 400 + o.x + o.y)})`;
      g.stroke();
      g.save();
      g.clip();
      g.strokeStyle = palette.hatch ? "rgba(0, 0, 0, 0.35)" : "rgba(255, 255, 255, 0.07)";
      g.lineWidth = Math.max(1, cell * (palette.hatch ? 0.09 : 0.05));
      for (let d = -s; d <= s; d += s / (palette.hatch ? 3 : 4)) {
        g.beginPath();
        g.moveTo(d - s / 2, -s / 2);
        g.lineTo(d + s / 2, s / 2);
        g.stroke();
      }
      g.restore();
      g.fillStyle = "rgba(255, 255, 255, 0.22)";
      g.beginPath();
      g.roundRect(-s * 0.38, -s * 0.4, s * 0.76, s * 0.12, s * 0.06);
      g.fill();
      g.restore();
    }
  }

  function drawFood(p: Point, time: number): void {
    const c = center(p);
    const pulse = reducedMotion ? 1 : 1 + 0.08 * Math.sin(time / 180);
    const r = cell * 0.34 * pulse;
    g.save();
    g.shadowColor = palette.food[1];
    g.shadowBlur = cell * 0.9;
    const orb = g.createRadialGradient(c.x - r * 0.35, c.y - r * 0.35, r * 0.1, c.x, c.y, r);
    orb.addColorStop(0, palette.food[0]);
    orb.addColorStop(0.35, palette.food[1]);
    orb.addColorStop(1, palette.food[2]);
    g.fillStyle = orb;
    g.beginPath();
    g.arc(c.x, c.y, r, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    if (palette.leaf) {
      g.fillStyle = palette.leaf;
      g.beginPath();
      g.ellipse(c.x + r * 0.35, c.y - r * 1.02, r * 0.38, r * 0.18, -0.6, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(c.x, c.y, r * 0.28, 0, Math.PI * 2);
      g.fill();
    }
    if (!reducedMotion) {
      for (let i = 0; i < 3; i += 1) {
        const angle = time / 700 + (i * Math.PI * 2) / 3;
        const orbit = cell * 0.55;
        g.fillStyle = `rgba(255, 255, 255, ${0.35 + 0.35 * Math.sin(time / 200 + i)})`;
        g.beginPath();
        g.arc(c.x + Math.cos(angle) * orbit, c.y + Math.sin(angle) * orbit, cell * 0.045, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  function drawLucky(p: Point, time: number): void {
    const c = center(p);
    const pulse = reducedMotion ? 1 : 1 + 0.1 * Math.sin(time / 150);
    const r = cell * 0.33 * pulse;
    g.save();
    g.shadowColor = palette.lucky[1];
    g.shadowBlur = cell * 1.1;
    const orb = g.createRadialGradient(c.x - r * 0.35, c.y - r * 0.35, r * 0.1, c.x, c.y, r);
    orb.addColorStop(0, palette.lucky[0]);
    orb.addColorStop(0.4, palette.lucky[1]);
    orb.addColorStop(1, palette.lucky[2]);
    g.fillStyle = orb;
    g.beginPath();
    if (palette.hatch) {
      g.moveTo(c.x, c.y - r * 1.15);
      g.lineTo(c.x + r * 1.15, c.y);
      g.lineTo(c.x, c.y + r * 1.15);
      g.lineTo(c.x - r * 1.15, c.y);
      g.closePath();
    } else {
      g.arc(c.x, c.y, r, 0, Math.PI * 2);
    }
    g.fill();
    g.shadowBlur = 0;
    if (!reducedMotion) {
      for (let i = 0; i < 4; i += 1) {
        const angle = -time / 450 + (i * Math.PI * 2) / 4;
        const orbit = cell * 0.5;
        g.fillStyle = `rgba(255, 236, 170, ${0.45 + 0.4 * Math.sin(time / 160 + i)})`;
        g.beginPath();
        g.arc(c.x + Math.cos(angle) * orbit, c.y + Math.sin(angle) * orbit, cell * 0.05, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  function timerRing(r: number, remaining: number, color: string): void {
    g.lineWidth = Math.max(1.5, cell * 0.07);
    g.strokeStyle = "rgba(255, 255, 255, 0.12)";
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = color;
    g.beginPath();
    g.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remaining);
    g.stroke();
  }

  function drawBonus(state: GameState, time: number): void {
    const bonus = state.bonus;
    if (!bonus) return;
    if (bonus.ticksLeft <= 10 && !reducedMotion && Math.floor(time / 120) % 2 === 0) return;
    const c = center(bonus.position);
    const bob = reducedMotion ? 0 : Math.sin(time / 260) * cell * 0.06;
    const r = cell * 0.4;
    const colors = bonus.kind === "gem" ? palette.gem : palette.gold;
    g.save();
    g.translate(c.x, c.y + bob);
    timerRing(r * 1.25, bonus.ticksLeft / bonus.lifetime, colors[1]);

    if (bonus.kind === "gold") {
      const spin = reducedMotion ? 1 : Math.abs(Math.cos(time / 380)) * 0.8 + 0.2;
      g.scale(spin, 1);
      g.shadowColor = colors[1];
      g.shadowBlur = cell * 0.9;
      const coin = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      coin.addColorStop(0, colors[0]);
      coin.addColorStop(0.5, colors[1]);
      coin.addColorStop(1, colors[2]);
      g.fillStyle = coin;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = "rgba(0, 0, 0, 0.3)";
      g.lineWidth = Math.max(1, cell * 0.05);
      g.beginPath();
      g.arc(0, 0, r * 0.68, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "rgba(60, 30, 0, 0.75)";
      g.font = `900 ${Math.round(r * 0.95)}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("3", 0, r * 0.05);
    } else {
      g.rotate(reducedMotion ? 0 : Math.sin(time / 500) * 0.25);
      g.shadowColor = colors[1];
      g.shadowBlur = cell;
      const gem = g.createLinearGradient(-r, -r, r, r);
      gem.addColorStop(0, colors[0]);
      gem.addColorStop(0.45, colors[1]);
      gem.addColorStop(1, colors[2]);
      g.fillStyle = gem;
      g.beginPath();
      g.moveTo(0, -r);
      g.lineTo(r * 0.85, -r * 0.2);
      g.lineTo(0, r);
      g.lineTo(-r * 0.85, -r * 0.2);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = "rgba(255, 255, 255, 0.55)";
      g.lineWidth = Math.max(1, cell * 0.04);
      g.beginPath();
      g.moveTo(-r * 0.85, -r * 0.2);
      g.lineTo(r * 0.85, -r * 0.2);
      g.moveTo(0, -r);
      g.lineTo(0, r);
      g.stroke();
      if (!reducedMotion) {
        g.fillStyle = `rgba(255, 255, 255, ${(Math.sin(time / 200) + 1) / 2})`;
        g.beginPath();
        g.arc(r * 0.35, -r * 0.45, r * 0.12, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  function drawPowerUp(state: GameState, time: number): void {
    const item = state.powerUp;
    if (!item) return;
    if (item.ticksLeft <= 10 && !reducedMotion && Math.floor(time / 120) % 2 === 0) return;
    const c = center(item.position);
    const r = cell * 0.38;
    const colors = palette.eat[item.kind];
    g.save();
    g.translate(c.x, c.y + (reducedMotion ? 0 : Math.sin(time / 300) * cell * 0.07));
    timerRing(r * 1.3, item.ticksLeft / item.lifetime, colors[0]);
    g.shadowColor = colors[0];
    g.shadowBlur = cell;

    if (item.kind === "slow") {
      g.fillStyle = "#0d1b4d";
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = colors[0];
      g.lineWidth = Math.max(1.5, cell * 0.07);
      g.stroke();
      const hand = reducedMotion ? 0 : time / 900;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(hand) * r * 0.6, Math.sin(hand) * r * 0.6);
      g.moveTo(0, 0);
      g.lineTo(Math.cos(hand / 12 - 1) * r * 0.4, Math.sin(hand / 12 - 1) * r * 0.4);
      g.stroke();
    } else {
      const wobble = reducedMotion ? 0 : Math.sin(time / 150) * r * 0.08;
      g.globalAlpha = 0.8 + 0.2 * Math.sin(time / 250);
      g.fillStyle = colors[1];
      g.beginPath();
      g.arc(0, -r * 0.15, r * 0.75, Math.PI, 0);
      g.lineTo(r * 0.75, r * 0.7);
      for (let i = 0; i < 3; i += 1) {
        const x0 = r * 0.75 - (i + 0.5) * (r * 0.5);
        g.lineTo(x0, r * 0.45 + wobble * (i % 2 ? 1 : -1));
        g.lineTo(x0 - r * 0.25, r * 0.7);
      }
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.globalAlpha = 1;
      g.fillStyle = "#1a0f3d";
      for (const side of [-1, 1]) {
        g.beginPath();
        g.ellipse(side * r * 0.28, -r * 0.2, r * 0.12, r * 0.18, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  function snakePoints(time: number): Point[] {
    if (!curr) return [];
    const from = prev ?? curr;
    const t = curr.status === "playing" ? clamp01((time - moveStart) / moveDuration) : 1;
    return curr.snake.map((segment, i) => {
      const start = from.snake[Math.min(i, from.snake.length - 1)] ?? segment;
      return { x: (lerp(start.x, segment.x, t) + 0.5) * cell, y: (lerp(start.y, segment.y, t) + 0.5) * cell };
    });
  }

  function drawTrail(time: number): void {
    if (reducedMotion || trail.length < 2) return;
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const point of trail) {
      const age = (time - point.t) / 350;
      if (age >= 1) continue;
      g.fillStyle = `rgba(${palette.glow}, ${0.18 * (1 - age)})`;
      g.beginPath();
      g.arc(point.x, point.y, cell * 0.32 * (1 - age * 0.6), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  function drawSnake(time: number): void {
    if (!curr) return;
    const points = snakePoints(time);
    if (points.length === 0) return;
    const dead = curr.status === "game_over";
    const ghost = curr.effects.ghost > 0 && !dead;
    const deathT = dead ? clamp01((time - deadAt) / 600) : 0;
    const count = points.length;

    if (curr.status === "playing") {
      trail.push({ x: points[0].x, y: points[0].y, t: time });
      trail = trail.filter((p) => time - p.t < 350);
    }
    drawTrail(time);

    g.save();
    if (ghost) g.globalAlpha = 0.45 + 0.2 * Math.sin(time / 120);
    if (dead) g.globalAlpha = 1 - deathT * 0.55;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.shadowColor = dead ? "rgba(255, 60, 90, 0.8)" : ghost ? "rgba(200, 180, 255, 0.9)" : `rgba(${palette.glow}, 0.7)`;
    g.shadowBlur = cell * 0.9;
    g.strokeStyle = dead ? "rgba(255, 60, 90, 0.35)" : `rgba(${palette.glow}, 0.3)`;
    g.lineWidth = cell * 0.82;
    g.beginPath();
    points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
    g.stroke();
    g.shadowBlur = 0;

    const [h0, h1] = palette.snakeHue;
    for (let i = count - 1; i >= 0; i -= 1) {
      const k = count === 1 ? 0 : i / (count - 1);
      const radius = cell * (0.4 - 0.13 * k);
      const light = lerp(62, 40, k);
      const color = dead
        ? `hsl(${lerp(350, 330, k)}, ${lerp(70, 20, deathT)}%, ${light - 10}%)`
        : ghost ? `hsl(${lerp(255, 275, k)}, 80%, ${light + 12}%)`
          : `hsl(${lerp(h0, h1, k)}, ${palette.snakeSat}%, ${light}%)`;
      const p = points[i];
      const next = points[i - 1];
      if (next) {
        g.strokeStyle = color;
        g.lineWidth = radius * 2;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(next.x, next.y);
        g.stroke();
      }
      g.fillStyle = color;
      g.beginPath();
      g.arc(p.x, p.y, radius, 0, Math.PI * 2);
      g.fill();
    }

    g.strokeStyle = "rgba(255, 255, 255, 0.22)";
    g.lineWidth = cell * 0.1;
    g.beginPath();
    points.forEach((p, i) => (i === 0 ? g.moveTo(p.x - cell * 0.1, p.y - cell * 0.12) : g.lineTo(p.x - cell * 0.1, p.y - cell * 0.12)));
    g.stroke();

    for (let i = 2; i < count; i += 2) {
      const k = i / (count - 1);
      g.fillStyle = "rgba(0, 0, 0, 0.12)";
      g.beginPath();
      g.arc(points[i].x, points[i].y, cell * (0.4 - 0.13 * k) * 0.45, 0, Math.PI * 2);
      g.fill();
    }

    drawHead(points[0], curr.direction, dead, ghost, time);
    g.restore();
  }

  function drawRival(state: GameState): void {
    const rival = state.rival;
    if (!rival?.alive || rival.snake.length === 0) return;
    const color = palette.hatch ? "#d55e00" : "#ff4dd2";
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";
    g.shadowColor = color;
    g.shadowBlur = cell * 0.75;
    g.strokeStyle = `${color}88`;
    g.lineWidth = cell * 0.68;
    g.beginPath();
    rival.snake.forEach((segment, index) => {
      const p = center(segment);
      if (index === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    });
    g.stroke();
    rival.snake.forEach((segment, index) => {
      const p = center(segment);
      const radius = cell * (index === 0 ? 0.37 : 0.29);
      g.fillStyle = index === 0 ? "#fff0fb" : color;
      g.beginPath();
      g.arc(p.x, p.y, radius, 0, Math.PI * 2);
      g.fill();
      if (index === 0) {
        g.fillStyle = color;
        g.beginPath();
        g.arc(p.x, p.y, radius * 0.56, 0, Math.PI * 2);
        g.fill();
      }
    });
    g.restore();
  }

  function drawHead(p: Point, direction: Direction, dead: boolean, ghost: boolean, time: number): void {
    const r = cell * 0.47;
    const angle = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[direction];
    g.save();
    g.translate(p.x, p.y);
    g.rotate(angle);
    const head = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    head.addColorStop(0, dead ? "#ffb3c1" : ghost ? "#f3edff" : palette.headLight);
    head.addColorStop(1, dead ? "#c9184a" : ghost ? "#9d7bff" : palette.headDark);
    g.fillStyle = head;
    g.beginPath();
    g.ellipse(0, 0, r * 1.05, r, 0, 0, Math.PI * 2);
    g.fill();

    if (!dead && !reducedMotion && Math.floor(time / 900) % 3 === 0) {
      const flick = Math.sin(((time % 900) / 900) * Math.PI);
      g.strokeStyle = "#ff4d6d";
      g.lineWidth = Math.max(1, cell * 0.06);
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(r * 0.9, 0);
      g.lineTo(r * (0.9 + 0.55 * flick), 0);
      g.lineTo(r * (1.05 + 0.6 * flick), -r * 0.15 * flick);
      g.moveTo(r * (0.9 + 0.55 * flick), 0);
      g.lineTo(r * (1.05 + 0.6 * flick), r * 0.15 * flick);
      g.stroke();
    }

    const blink = !reducedMotion && time % 3200 < 120;
    for (const side of [-1, 1]) {
      const ex = r * 0.32;
      const ey = side * r * 0.42;
      g.fillStyle = "#ffffff";
      g.beginPath();
      if (blink && !dead) g.ellipse(ex, ey, r * 0.26, r * 0.05, 0, 0, Math.PI * 2);
      else g.arc(ex, ey, r * 0.26, 0, Math.PI * 2);
      g.fill();
      if (dead) {
        g.strokeStyle = "#2b0010";
        g.lineWidth = Math.max(1, cell * 0.05);
        const d = r * 0.14;
        g.beginPath();
        g.moveTo(ex - d, ey - d); g.lineTo(ex + d, ey + d);
        g.moveTo(ex + d, ey - d); g.lineTo(ex - d, ey + d);
        g.stroke();
      } else if (!blink) {
        g.fillStyle = "#0b1020";
        g.beginPath();
        g.arc(ex + r * 0.08, ey, r * 0.14, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.arc(ex + r * 0.12, ey - r * 0.06, r * 0.05, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  function drawEffects(time: number, dt: number): void {
    deathBursts = deathBursts.filter((item) => {
      if (time < item.when) return true;
      burst(item.at, ["#ff4d6d", "#ff9e00", "#ffffff"], 7, cell * 6);
      return false;
    });

    g.save();
    rings = rings.filter((item) => {
      const age = (time - item.born) / 550;
      if (age < 0) return true;
      if (age >= 1) return false;
      g.globalAlpha = 1 - age;
      g.strokeStyle = item.color;
      g.lineWidth = Math.max(1, cell * 0.14 * (1 - age));
      g.beginPath();
      g.arc(item.x, item.y, easeOutCubic(age) * item.maxRadius, 0, Math.PI * 2);
      g.stroke();
      return true;
    });
    g.restore();

    g.save();
    g.globalCompositeOperation = "lighter";
    particles = particles.filter((p) => {
      p.life += dt;
      if (p.life >= p.maxLife) return false;
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);
      p.vx *= 0.94;
      p.vy = p.vy * 0.94 + cell * 0.25;
      const alpha = 1 - p.life / p.maxLife;
      g.globalAlpha = alpha;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
      g.fill();
      return true;
    });
    g.restore();

    g.save();
    g.textAlign = "center";
    g.textBaseline = "middle";
    texts = texts.filter((text) => {
      const age = (time - text.born) / 900;
      if (age >= 1) return false;
      g.globalAlpha = 1 - age;
      g.font = `900 ${Math.round(cell * (0.7 + 0.3 * easeOutBack(clamp01(age * 4))))}px system-ui, sans-serif`;
      g.shadowColor = text.color;
      g.shadowBlur = cell * 0.6;
      g.fillStyle = "#ffffff";
      g.fillText(text.text, text.x, text.y - age * cell * 1.6);
      return true;
    });
    g.restore();

    if (curr && curr.combo > 1 && curr.status === "playing") {
      const heat = (curr.combo - 1) / Math.max(1, config.maxComboMultiplier - 1);
      const pulse = reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(time / 140);
      const edge = g.createRadialGradient(size / 2, size / 2, size * 0.42, size / 2, size / 2, size * 0.72);
      edge.addColorStop(0, "rgba(255, 180, 0, 0)");
      edge.addColorStop(1, `rgba(255, ${Math.round(lerp(200, 70, heat))}, 40, ${0.45 * heat * pulse + 0.12})`);
      g.fillStyle = edge;
      g.fillRect(0, 0, size, size);
    }

    if (flash && time < flash.until) {
      g.save();
      g.globalAlpha = 0.28 * ((flash.until - time) / flash.duration);
      g.fillStyle = flash.color;
      g.fillRect(0, 0, size, size);
      g.restore();
    }

    banners = banners.filter((item) => {
      const age = (time - item.born) / 1300;
      if (age >= 1) return false;
      const enter = easeOutBack(clamp01(age * 5));
      const leave = clamp01((age - 0.75) * 4);
      g.save();
      g.globalAlpha = 1 - leave;
      g.translate(size / 2 + (reducedMotion ? 0 : leave * size * 0.6), size * 0.3);
      g.scale(enter, enter);
      g.fillStyle = "rgba(6, 5, 26, 0.55)";
      g.fillRect(-size / 2, -cell * 1.1, size, cell * 2.2);
      g.font = `900 ${Math.round(cell * 1.5)}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = item.color;
      g.shadowBlur = cell * 1.2;
      g.fillStyle = "#ffffff";
      g.fillText(item.text, 0, 0);
      g.restore();
      return true;
    });

    const vignette = g.createRadialGradient(size / 2, size / 2, size * 0.45, size / 2, size / 2, size * 0.75);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.45)");
    g.fillStyle = vignette;
    g.fillRect(0, 0, size, size);
  }

  function frame(time: number): void {
    const dt = Math.min(50, time - lastFrame);
    lastFrame = time;
    const busy = curr?.status === "playing" || particles.length > 0 || texts.length > 0 || rings.length > 0
      || banners.length > 0 || deathBursts.length > 0 || time < shakeUntil || (flash !== null && time < flash.until)
      || [...obstacleBorn.values()].some((born) => time - born < 500);
    if (curr && size > 0 && (busy || time - lastDraw >= IDLE_FRAME_MS)) {
      lastDraw = time;
      g.save();
      if (time < shakeUntil) {
        const strength = shakeStrength * ((shakeUntil - time) / 450);
        g.translate((Math.random() - 0.5) * strength * 2, (Math.random() - 0.5) * strength * 2);
      }
      drawBackground(time, curr);
      drawObstacles(curr, time);
      if (curr.food) drawFood(curr.food, time);
      if (curr.lucky) drawLucky(curr.lucky, time);
      drawBonus(curr, time);
      drawPowerUp(curr, time);
      drawRival(curr);
      drawSnake(time);
      drawEffects(time, dt);
      g.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    update,
    banner,
    setColorblind: (enabled) => { palette = enabled ? PALETTES.colorblind : PALETTES.normal; },
  };
}
