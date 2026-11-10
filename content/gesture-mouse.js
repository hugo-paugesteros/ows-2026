// Webcam hand-gesture cursor: move your hand to aim (tracks the index knuckle),
// pinch thumb + index to click, pinch and drag to swipe. Dispatches synthetic pointer/mouse/click events,
// so it drives any element with click listeners inside this page only.
// MediaPipe files are vendored in ../dist/@mediapipe so this works offline.
const MEDIAPIPE = new URL('../dist/@mediapipe/', import.meta.url);
const BUNDLE_URL = new URL('tasks-vision@0.10.14/vision_bundle.mjs', MEDIAPIPE).href;
const WASM_URL = new URL('tasks-vision@0.10.14/wasm', MEDIAPIPE).href;
const MODEL_URL = new URL('hand_landmarker.task', MEDIAPIPE).href;

// MediaPipe hand landmark indices.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

export const defaultOptions = {
  // Fraction of the camera frame ignored on each side; the inner box maps to the full screen.
  marginX: 0.2,
  marginTop: 0.15,
  marginBottom: 0.3,
  // One Euro filter: lower minCutoff = less jitter at rest, higher beta = less lag when moving fast.
  minCutoff: 1.5,
  beta: 0.01,
  // Pinch distance (thumb tip to index tip) relative to palm size (wrist to index knuckle).
  pinchOn: 0.3,
  pinchOff: 0.45,
  // A pinch that moves farther than this (px) is a drag, not a click.
  dragTolerance: 40,
  // Pinch-drag distance, as a fraction of the screen size, that triggers onSwipe.
  swipeThreshold: 0.15,
  // Hide the cursor after the hand has been lost for this long (ms).
  lostTimeout: 300,
  preview: true,
  deviceId: undefined,
  onUpdate: undefined,
  onClick: undefined,
  // Called once per pinch with the direction the hand moved: 'left' | 'right' | 'up' | 'down'.
  onSwipe: undefined,
};

class OneEuroFilter {
  constructor(opts) {
    this.opts = opts;
    this.reset();
  }

  reset() {
    this.x = undefined;
    this.dx = 0;
    this.t = undefined;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x, t) {
    if (this.x === undefined) {
      this.x = x;
      this.t = t;
      return x;
    }
    const dt = Math.max((t - this.t) / 1000, 1e-3);
    const dx = (x - this.x) / dt;
    this.dx += OneEuroFilter.alpha(1, dt) * (dx - this.dx);
    const cutoff = this.opts.minCutoff + this.opts.beta * Math.abs(this.dx);
    this.x += OneEuroFilter.alpha(cutoff, dt) * (x - this.x);
    this.t = t;
    return this.x;
  }
}

export function injectStyles() {
  if (document.getElementById('gesture-mouse-style')) return;
  const style = document.createElement('style');
  style.id = 'gesture-mouse-style';
  style.textContent = `
    .gesture-cursor {
      position: fixed; left: 0; top: 0; width: 28px; height: 28px;
      margin: -14px 0 0 -14px; border-radius: 50%;
      border: 3px solid #ffcc33; box-shadow: 0 0 0 2px rgba(0,0,0,.6);
      pointer-events: none; z-index: 2147483647; opacity: 0;
      transition: opacity .15s, background-color .08s, scale .08s;
    }
    .gesture-cursor.visible { opacity: 1; }
    .gesture-cursor.pinched { background: rgba(255, 204, 51, .8); scale: .7; }
    .gesture-preview {
      position: fixed; right: 12px; bottom: 12px; width: 240px;
      border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.5);
      pointer-events: none; z-index: 2147483646; opacity: .85;
    }
  `;
  document.head.append(style);
}

export function dispatch(el, type, x, y, Ctor) {
  el.dispatchEvent(
    new Ctor(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      view: window,
      button: 0,
      buttons: type.endsWith('down') || type.endsWith('move') ? 1 : 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    }),
  );
}

// document.elementFromPoint stops at shadow hosts; descend into open shadow roots
// so events reach the actual button or slider inside custom elements.
export function deepElementFromPoint(x, y) {
  let el = document.elementFromPoint(x, y);
  while (el?.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el ?? document.body;
}

// Browsers ignore synthetic events for native widgets, so their behavior is emulated.
export const isRange = (el) => el instanceof HTMLInputElement && el.type === 'range' && !el.disabled;

export function setRangeFromX(input, x) {
  const r = input.getBoundingClientRect();
  const t = Math.min(Math.max((x - r.left) / r.width, 0), 1);
  const min = +input.min || 0;
  const max = input.max === '' ? 100 : +input.max;
  const old = input.value;
  input.value = min + t * (max - min);
  if (input.value !== old) input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

export function activateNative(el) {
  const video = el.closest?.('video[controls]');
  if (video) video.paused ? video.play() : video.pause();
}

export async function startGestureMouse(userOptions = {}) {
  const opts = { ...defaultOptions, ...userOptions };
  injectStyles();

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      ...(opts.deviceId ? { deviceId: { exact: opts.deviceId } } : { facingMode: 'user' }),
    },
  });
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();

  // Imported lazily so a loading failure surfaces as a rejected promise, not a dead page.
  const { FilesetResolver, HandLandmarker } = await import(BUNDLE_URL);
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const landmarkerOptions = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numHands: 1,
  });
  let landmarker;
  try {
    landmarker = await HandLandmarker.createFromOptions(fileset, landmarkerOptions('GPU'));
  } catch (err) {
    console.warn('gesture-mouse: GPU delegate failed, falling back to CPU', err);
    landmarker = await HandLandmarker.createFromOptions(fileset, landmarkerOptions('CPU'));
  }

  const cursor = document.createElement('div');
  cursor.className = 'gesture-cursor';
  document.body.append(cursor);

  let preview, ctx;
  if (opts.preview) {
    preview = document.createElement('canvas');
    preview.className = 'gesture-preview';
    preview.width = video.videoWidth;
    preview.height = video.videoHeight;
    ctx = preview.getContext('2d');
    document.body.append(preview);
  }

  const fx = new OneEuroFilter(opts);
  const fy = new OneEuroFilter(opts);
  const aspect = video.videoWidth / video.videoHeight;

  let x = 0, y = 0, visible = false, pinched = false, ratio = NaN;
  let lastSeen = 0, lastVideoTime = -1, downTarget = null, hoverTarget = null;
  let startX = 0, startY = 0, dragged = false, swiped = false, slider = null;
  let frames = 0, fpsStart = performance.now(), fps = 0;
  let raf = 0;

  const elementAt = deepElementFromPoint;

  const setHover = (el) => {
    if (el === hoverTarget) return;
    hoverTarget?.classList.remove('gesture-hover');
    hoverTarget = el;
    hoverTarget?.classList.add('gesture-hover');
  };

  const release = (withClick) => {
    if (!pinched) return;
    pinched = false;
    cursor.classList.remove('pinched');
    const target = elementAt(x, y);
    dispatch(target, 'pointerup', x, y, PointerEvent);
    dispatch(target, 'mouseup', x, y, MouseEvent);
    if (slider) {
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      slider = null;
    } else if (withClick && !dragged && downTarget) {
      // Click the element under the pinch start, so small drift during the pinch doesn't cancel it.
      const clickEvent = new MouseEvent('click', {
        bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window,
      });
      if (downTarget.dispatchEvent(clickEvent)) activateNative(downTarget);
      opts.onClick?.(downTarget, x, y);
    }
    downTarget = null;
  };

  const drawPreview = (hand) => {
    const w = preview.width, h = preview.height;
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    // Active region (mirrored coordinates).
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      opts.marginX * w,
      opts.marginTop * h,
      (1 - 2 * opts.marginX) * w,
      (1 - opts.marginTop - opts.marginBottom) * h,
    );
    if (!hand) return;
    const px = (p) => (1 - p.x) * w;
    const py = (p) => p.y * h;
    ctx.strokeStyle = '#4fc3f7';
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(px(hand[a]), py(hand[a]));
      ctx.lineTo(px(hand[b]), py(hand[b]));
    }
    ctx.stroke();
    for (const [i, color] of [[INDEX_MCP, '#ffcc33'], [THUMB_TIP, '#f66'], [INDEX_TIP, '#f66']]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px(hand[i]), py(hand[i]), 6, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    const now = performance.now();

    const hand = landmarker.detectForVideo(video, now).landmarks[0];
    if (preview) drawPreview(hand);

    frames++;
    if (now - fpsStart > 1000) {
      fps = (frames * 1000) / (now - fpsStart);
      frames = 0;
      fpsStart = now;
    }

    if (hand) {
      lastSeen = now;
      const dist = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
      ratio = dist(hand[THUMB_TIP], hand[INDEX_TIP]) / dist(hand[WRIST], hand[INDEX_MCP]);

      const nx = (1 - hand[INDEX_MCP].x - opts.marginX) / (1 - 2 * opts.marginX);
      const ny = (hand[INDEX_MCP].y - opts.marginTop) / (1 - opts.marginTop - opts.marginBottom);
      const clamp = (v) => Math.min(Math.max(v, 0), 1);
      x = fx.filter(clamp(nx) * (window.innerWidth - 1), now);
      y = fy.filter(clamp(ny) * (window.innerHeight - 1), now);

      if (!visible) {
        visible = true;
        cursor.classList.add('visible');
      }
      cursor.style.translate = `${x}px ${y}px`;

      const target = elementAt(x, y);
      setHover(target);
      dispatch(target, 'pointermove', x, y, PointerEvent);
      dispatch(target, 'mousemove', x, y, MouseEvent);

      if (!pinched && ratio < opts.pinchOn) {
        pinched = true;
        cursor.classList.add('pinched');
        downTarget = target;
        startX = x;
        startY = y;
        dragged = swiped = false;
        dispatch(target, 'pointerdown', x, y, PointerEvent);
        dispatch(target, 'mousedown', x, y, MouseEvent);
        if (isRange(target)) {
          slider = target;
          setRangeFromX(slider, x);
        }
      } else if (pinched && ratio > opts.pinchOff) {
        release(true);
      } else if (slider) {
        // Dragging a slider moves its thumb instead of swiping.
        setRangeFromX(slider, x);
      } else if (pinched) {
        const dx = x - startX, dy = y - startY;
        if (Math.hypot(dx, dy) > opts.dragTolerance) dragged = true;
        if (!swiped) {
          const horizontal = Math.abs(dx) > Math.abs(dy);
          const reach = horizontal
            ? Math.abs(dx) / window.innerWidth
            : Math.abs(dy) / window.innerHeight;
          if (reach > opts.swipeThreshold) {
            swiped = true;
            const dir = horizontal ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
            opts.onSwipe?.(dir);
          }
        }
      }
    } else if (visible && now - lastSeen > opts.lostTimeout) {
      release(false);
      visible = false;
      ratio = NaN;
      cursor.classList.remove('visible');
      setHover(null);
      fx.reset();
      fy.reset();
    }

    opts.onUpdate?.({ x, y, visible, pinched, dragged, ratio, fps });
  };
  raf = requestAnimationFrame(tick);

  return {
    options: opts,
    stop() {
      cancelAnimationFrame(raf);
      release(false);
      setHover(null);
      stream.getTracks().forEach((t) => t.stop());
      landmarker.close();
      cursor.remove();
      preview?.remove();
    },
  };
}
