/**
 * Renders the hero's 3D market scene on a canvas: rows of candlesticks receding into
 * fog over a floor grid, with the front session's initial balance band and price line.
 * Candles rise in on load, then the camera follows scroll and pointer. Every value is
 * a critically damped spring that starts from its current value, and the canvas only
 * redraws while a spring is moving.
 */
type Spring = { value: number; velocity: number; target: number; stiffness: number };
type Candle = { open: number; close: number; high: number; low: number };
type Vec = { x: number; y: number; z: number };

const COLUMNS = 26;
const ROWS = 4;
const ROW_GAP = 3.6;
const BODY_WIDTH = 0.74;
const BODY_DEPTH = 0.74;
const IB_BARS = 8;

function spring(value: number, response: number): Spring {
  return { value, velocity: 0, target: value, stiffness: (2 * Math.PI) / response };
}

/** Advances a critically damped spring (damping ratio 1.0); returns true while moving. */
function step(s: Spring, dt: number): boolean {
  const k = s.stiffness;
  s.velocity += (-k * k * (s.value - s.target) - 2 * k * s.velocity) * dt;
  s.value += s.velocity * dt;
  if (Math.abs(s.value - s.target) < 0.0005 && Math.abs(s.velocity) < 0.0005) {
    s.value = s.target;
    s.velocity = 0;
    return false;
  }
  return true;
}

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A session that ranges for the initial balance, then breaks out higher. */
function session(seed: number, breakout: boolean): Candle[] {
  const rand = random(seed);
  const candles: Candle[] = [];
  let price = 0;
  for (let i = 0; i < COLUMNS; i++) {
    const drift = breakout && i >= IB_BARS ? 0.26 : breakout ? 0 : (rand() - 0.47) * 0.4;
    const pull = breakout && i < IB_BARS ? -price * 0.35 : 0;
    const open = price;
    const close = open + drift + pull + (rand() - 0.5) * 2.2;
    candles.push({
      open,
      close,
      high: Math.max(open, close) + rand() * 0.7,
      low: Math.min(open, close) - rand() * 0.7,
    });
    price = close;
  }
  // Normalize each session into the same vertical band.
  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const scale = 9 / (hi - lo);
  return candles.map((c) => ({
    open: 0.5 + (c.open - lo) * scale,
    close: 0.5 + (c.close - lo) * scale,
    high: 0.5 + (c.high - lo) * scale,
    low: 0.5 + (c.low - lo) * scale,
  }));
}

export function startHeroScene(stage: HTMLElement, canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const ctx = context;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)");
  const events = new AbortController();
  const on = { signal: events.signal, passive: true } as const;

  const rows = Array.from({ length: ROWS }, (_, r) => session(7 + r * 31, r === 0));
  const front = rows[0]!;
  const ibHigh = Math.max(...front.slice(0, IB_BARS).map((c) => c.high));
  const ibLow = Math.min(...front.slice(0, IB_BARS).map((c) => c.low));

  const yaw = spring(-0.7, 0.6);
  const pitch = spring(0.4, 0.6);
  const rise = spring(0, 1.4);
  const drift = spring(0, 0.5);
  let width = 0;
  let height = 0;
  let pointerX = 0;
  let pointerY = 0;
  let baseYaw = -0.42;
  let basePitch = 0.26;
  let visible = true;
  let frame: number | undefined;
  let last = 0;

  function project(p: Vec) {
    const cy = Math.cos(yaw.value);
    const sy = Math.sin(yaw.value);
    const cp = Math.cos(pitch.value);
    const sp = Math.sin(pitch.value);
    const x1 = p.x * cy - p.z * sy;
    const z1 = p.x * sy + p.z * cy;
    const y1 = p.y * cp - z1 * sp;
    const z2 = p.y * sp + z1 * cp + 24;
    const focal = Math.min(width, height * 1.6) * 1.15;
    return { x: width * 0.47 + (x1 * focal) / z2, y: height * 0.7 - (y1 * focal) / z2, depth: z2 };
  }

  function polygon(points: Vec[], fill: string) {
    ctx.beginPath();
    points.forEach((point, i) => {
      const q = project(point);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function line(a: Vec, b: Vec, stroke: string, lineWidth: number) {
    const p = project(a);
    const q = project(b);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  const xAt = (i: number) => (i - (COLUMNS - 1) / 2) * 1.12;
  const zAt = (r: number) => r * ROW_GAP;
  /** Per-candle growth for the staggered rise, eased so each bar settles softly. */
  function growth(i: number, r: number) {
    const t = Math.min(Math.max(rise.value * 1.7 - (i / COLUMNS) * 0.5 - r * 0.08, 0), 1);
    return 1 - (1 - t) ** 3;
  }

  function candleColor(c: Candle, r: number, shade: number) {
    const fog = r === 0 ? 1 : 0.55 - r * 0.12;
    if (r === 0) {
      const [cr, cg, cb] = c.close >= c.open ? [79, 194, 140] : [255, 107, 107];
      return `rgba(${Math.round(cr * shade)}, ${Math.round(cg * shade)}, ${Math.round(cb * shade)}, ${0.95 * fog})`;
    }
    const tone = c.close >= c.open ? [120, 160, 240] : [70, 96, 160];
    return `rgba(${Math.round(tone[0]! * shade)}, ${Math.round(tone[1]! * shade)}, ${Math.round(tone[2]! * shade)}, ${0.7 * fog})`;
  }

  function drawCandle(c: Candle, i: number, r: number) {
    const g = growth(i, r);
    if (g <= 0) return;
    const x = xAt(i);
    const z = zAt(r);
    const lift = (v: number) => v * g;
    const fog = r === 0 ? 1 : 0.55 - r * 0.12;
    line(
      { x, y: lift(c.low), z },
      { x, y: lift(c.high), z },
      r === 0 ? `rgba(200, 214, 240, ${0.55 * fog})` : `rgba(140, 165, 220, ${0.35 * fog})`,
      r === 0 ? 1.2 : 1,
    );
    const y0 = lift(Math.min(c.open, c.close));
    const y1 = Math.max(lift(Math.max(c.open, c.close)), y0 + 0.08);
    const hw = BODY_WIDTH / 2;
    const hd = BODY_DEPTH / 2;
    const corner = (dx: number, y: number, dz: number): Vec => ({
      x: x + dx * hw,
      y,
      z: z + dz * hd,
    });
    // Side facing the camera: compare the depth of the two side faces.
    const leftNear =
      project({ x: x - hw, y: y0, z }).depth < project({ x: x + hw, y: y0, z }).depth;
    const sx = leftNear ? -1 : 1;
    polygon(
      [corner(sx, y0, -1), corner(sx, y0, 1), corner(sx, y1, 1), corner(sx, y1, -1)],
      candleColor(c, r, 0.55),
    );
    polygon(
      [corner(-1, y0, -1), corner(1, y0, -1), corner(1, y1, -1), corner(-1, y1, -1)],
      candleColor(c, r, 0.82),
    );
    polygon(
      [corner(-1, y1, -1), corner(1, y1, -1), corner(1, y1, 1), corner(-1, y1, 1)],
      candleColor(c, r, 1.15),
    );
  }

  function drawFloor() {
    const zFar = zAt(ROWS) + 2;
    for (let z = -2; z <= zFar; z += 2) {
      const fog = Math.max(0, 1 - (z + 2) / (zFar + 2));
      line(
        { x: xAt(-2), y: 0, z },
        { x: xAt(COLUMNS + 1), y: 0, z },
        `rgba(173, 201, 255, ${0.09 * fog})`,
        1,
      );
    }
    for (let i = -2; i <= COLUMNS + 1; i += 3) {
      line(
        { x: xAt(i), y: 0, z: -2 },
        { x: xAt(i), y: 0, z: zFar },
        "rgba(173, 201, 255, 0.05)",
        1,
      );
    }
  }

  function drawInitialBalance() {
    const g = growth(IB_BARS, 0);
    if (g <= 0) return;
    const z = zAt(0) + 0.9;
    const x0 = xAt(0) - 0.6;
    const x1 = xAt(IB_BARS - 1) + 0.6;
    polygon(
      [
        { x: x0, y: ibLow * g, z },
        { x: x1, y: ibLow * g, z },
        { x: x1, y: ibHigh * g, z },
        { x: x0, y: ibHigh * g, z },
      ],
      `rgba(88, 137, 237, ${0.2 * g})`,
    );
    ctx.setLineDash([5, 6]);
    for (const level of [ibHigh, ibLow]) {
      line(
        { x: x0, y: level * g, z },
        { x: xAt(COLUMNS - 1) + 0.6, y: level * g, z },
        `rgba(140, 178, 255, ${0.45 * g})`,
        1,
      );
    }
    ctx.setLineDash([]);
  }

  function drawPriceLine() {
    const path = () => {
      ctx.beginPath();
      front.forEach((c, i) => {
        const q = project({
          x: xAt(i),
          y: c.close * growth(i, 0),
          z: zAt(0) - BODY_DEPTH / 2 - 0.05,
        });
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
    };
    const g = growth(COLUMNS - 1, 0);
    path();
    ctx.strokeStyle = `rgba(143, 178, 255, ${0.16 * g})`;
    ctx.lineWidth = 7;
    ctx.stroke();
    path();
    ctx.strokeStyle = `rgba(220, 232, 255, ${0.85 * g})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = canvas.width / Math.max(width, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = "round";
    drawFloor();
    for (let r = ROWS - 1; r >= 0; r--) {
      if (r === 0) drawInitialBalance();
      const order = rows[r]!.map((_, i) => i).sort(
        (a, b) =>
          project({ x: xAt(b), y: 0, z: zAt(r) }).depth -
          project({ x: xAt(a), y: 0, z: zAt(r) }).depth,
      );
      for (const i of order) drawCandle(rows[r]![i]!, i, r);
    }
    drawPriceLine();
    stage.style.setProperty("--chip-x", `${(drift.value * 10).toFixed(2)}px`);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    render();
  }

  function retarget() {
    yaw.target = baseYaw + pointerX * 0.1;
    pitch.target = basePitch - pointerY * 0.05;
    drift.target = pointerX;
    kick();
  }

  function tick(now: number) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const moving = [step(yaw, dt), step(pitch, dt), step(rise, dt), step(drift, dt)].some(Boolean);
    render();
    frame = moving && visible ? requestAnimationFrame(tick) : undefined;
  }

  function kick() {
    if (frame !== undefined || !visible) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function readScroll() {
    const progress = Math.min(Math.max(window.scrollY / (window.innerHeight * 0.8), 0), 1);
    baseYaw = -0.42 + 0.26 * progress;
    basePitch = 0.26 - 0.1 * progress;
    retarget();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();
  stage.dataset.ready = "";

  if (reducedMotion.matches) {
    for (const s of [yaw, pitch, rise]) s.value = s.target;
    yaw.value = baseYaw;
    pitch.value = basePitch;
    rise.value = 1;
    render();
    return () => resizeObserver.disconnect();
  }

  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) kick();
  });
  visibility.observe(stage);

  window.addEventListener("scroll", readScroll, on);
  const hero = stage.closest<HTMLElement>(".hero");
  hero?.addEventListener(
    "pointermove",
    (event) => {
      if (!finePointer.matches) return;
      pointerX = ((event as PointerEvent).clientX / window.innerWidth - 0.5) * 2;
      pointerY = ((event as PointerEvent).clientY / window.innerHeight - 0.5) * 2;
      retarget();
    },
    on,
  );
  hero?.addEventListener(
    "pointerleave",
    () => {
      pointerX = 0;
      pointerY = 0;
      retarget();
    },
    on,
  );

  rise.target = 1;
  readScroll();

  return () => {
    events.abort();
    visibility.disconnect();
    resizeObserver.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
}
