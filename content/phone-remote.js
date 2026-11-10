// Phone remote (see remote/server.py): the phone moves the cursor on the slides, clicks, drags
// sliders and changes slides; the deck sends back the current notes. There is no cursor of its own:
// the synthetic mouse events move kursor (cursor.js) like the real mouse does. Connects to
// ws://localhost:8000/ws (or ?remote=<ws url>) and keeps retrying quietly while the server is down.
// The speaker view's preview iframes (?receiver) are left alone.
import { dispatch, deepElementFromPoint, isRange, setRangeFromX, activateNative } from './gesture-mouse.js';

const params = new URLSearchParams(location.search);
const SERVER = params.get('remote') ?? 'ws://localhost:8000/ws';
// A press that moves farther than this (px) is a drag, not a click.
const DRAG_TOLERANCE = 15;

if (!params.has('receiver')) start();

function start() {
  let ws = null;
  let x = innerWidth / 2, y = innerHeight / 2;
  let pressed = false, downTarget = null, slider = null, dragged = false, startX = 0, startY = 0;

  const send = (msg) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

  // The phone carries on from wherever the real mouse left the cursor.
  addEventListener('mousemove', (e) => {
    if (!e.isTrusted) return;
    x = e.clientX;
    y = e.clientY;
  });

  // Also wakes kursor, which cursor.js hides after a while without mouse moves.
  const hover = () => {
    const target = deepElementFromPoint(x, y);
    dispatch(target, 'pointermove', x, y, PointerEvent);
    dispatch(target, 'mousemove', x, y, MouseEvent);
  };

  // Deltas come in screen widths for both axes, so the phone needs no idea of the deck's size.
  const moveBy = (dx, dy) => {
    const clamp = (v, max) => Math.min(Math.max(v, 0), max);
    x = clamp(x + dx * innerWidth, innerWidth - 1);
    y = clamp(y + dy * innerWidth, innerHeight - 1);
    hover();
    if (slider) setRangeFromX(slider, x);
    else if (pressed && Math.hypot(x - startX, y - startY) > DRAG_TOLERANCE) dragged = true;
  };

  const press = () => {
    if (pressed) return;
    pressed = true;
    hover();
    downTarget = deepElementFromPoint(x, y);
    startX = x;
    startY = y;
    dragged = false;
    dispatch(downTarget, 'pointerdown', x, y, PointerEvent);
    dispatch(downTarget, 'mousedown', x, y, MouseEvent);
    if (isRange(downTarget)) {
      slider = downTarget;
      setRangeFromX(slider, x);
    }
  };

  const release = (withClick) => {
    if (!pressed) return;
    pressed = false;
    const target = deepElementFromPoint(x, y);
    dispatch(target, 'pointerup', x, y, PointerEvent);
    dispatch(target, 'mouseup', x, y, MouseEvent);
    if (slider) {
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      slider = null;
    } else if (withClick && !dragged && downTarget) {
      const clickEvent = new MouseEvent('click', {
        bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window,
      });
      if (downTarget.dispatchEvent(clickEvent)) activateNative(downTarget);
    }
    downTarget = null;
  };

  // Same notes as the speaker view: the current fragment's notes win over the slide's.
  const sendState = () => {
    const slide = Reveal.getCurrentSlide();
    if (!slide) return;
    let notes = slide.getAttribute('data-notes') ?? '';
    let asides = [...slide.querySelectorAll('aside.notes')].filter((e) => !e.closest('.fragment'));
    const fragment = slide.querySelector('.current-fragment');
    const fragmentAside = fragment?.querySelector('aside.notes');
    if (fragmentAside) asides = [fragmentAside];
    else if (fragment?.hasAttribute('data-notes')) {
      notes = fragment.getAttribute('data-notes');
      asides = [];
    }
    if (asides.length) notes = asides.map((e) => e.innerHTML).join('\n');

    const slides = Reveal.getSlides();
    const index = slides.indexOf(slide);
    send({
      t: 'state',
      notes: notes.trim(),
      index: index + 1,
      total: slides.length,
      fragments: Reveal.availableFragments(),
      title: slide.querySelector('h1, h2, h3')?.textContent.trim() ?? '',
      nextTitle: slides[index + 1]?.querySelector('h1, h2, h3')?.textContent.trim() ?? '',
      // Phone clicks are synthetic: until a real key press or click here (or an autoplay
      // exception for this site), sound and video won't start from them.
      activated: navigator.getAutoplayPolicy
        ? navigator.getAutoplayPolicy('mediaelement') === 'allowed'
        : navigator.userActivation?.hasBeenActive ?? true,
    });
  };

  const handle = (msg) => {
    switch (msg.t) {
      case 'move': moveBy(msg.dx, msg.dy); break;
      case 'down': press(); break;
      case 'up': release(msg.click); break;
      case 'click': press(); release(true); break;
      case 'nav': msg.dir === 'next' ? Reveal.next() : Reveal.prev(); break;
      case 'hello': sendState(); break;
    }
  };

  const connect = () => {
    ws = new WebSocket(`${SERVER}?role=deck`);
    ws.onopen = sendState;
    ws.onmessage = ({ data }) => handle(JSON.parse(data));
    ws.onclose = () => {
      release(false);
      setTimeout(connect, 2000);
    };
  };

  const bind = () => {
    for (const e of ['slidechanged', 'fragmentshown', 'fragmenthidden']) Reveal.on(e, sendState);
    for (const e of ['keydown', 'pointerdown']) addEventListener(e, () => setTimeout(sendState), { once: true });
    connect();
  };
  if (Reveal.isReady()) bind();
  else Reveal.on('ready', bind);
}
