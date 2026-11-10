// Press M to toggle the webcam gesture cursor (see gesture-mouse.js): pinch to click,
// pinch and drag to change slides like a touch swipe. Off by default;
// the camera and model are only loaded on first use.
import { startGestureMouse } from './gesture-mouse.js';

let gm = null;
let starting = false;

const toast = document.createElement('div');
toast.className = 'gesture-toast';
document.body.append(toast);
let toastTimer;

function notify(msg, isError = false) {
  toast.textContent = msg;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), isError ? 5000 : 1500);
}

// Same mapping as reveal.js touch swipes: pulling the slide left reveals the next one.
function onSwipe(dir) {
  if (dir === 'left') Reveal.next();
  else if (dir === 'right') Reveal.prev();
  else if (dir === 'up') Reveal.down();
  else Reveal.up();
}

async function toggle() {
  if (starting) return;
  if (gm) {
    gm.stop();
    gm = null;
    notify('Gesture mouse off');
    return;
  }
  starting = true;
  notify('Starting gesture mouse…');
  try {
    gm = await startGestureMouse({ preview: false, onSwipe });
    notify('Gesture mouse on');
  } catch (err) {
    console.error(err);
    notify(`Gesture mouse failed: ${err.message ?? err}`, true);
  } finally {
    starting = false;
  }
}

const bind = () =>
  Reveal.addKeyBinding({ keyCode: 77, key: 'M', description: 'Toggle gesture mouse' }, toggle);
if (Reveal.isReady()) bind();
else Reveal.on('ready', bind);
