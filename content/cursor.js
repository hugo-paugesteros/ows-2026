// Kursor (https://lusaxweb.github.io/Kursor/) replaces the system cursor on the slides.
// It hides after reveal's hideCursorTime without movement (5 s by default).
// Press C to switch back to the normal cursor. The speaker view's preview iframes (?receiver)
// are left alone.
if (!new URLSearchParams(location.search).has('receiver')) {
  const k = new kursor({ type: 1, removeDefaultCursor: true });
  let enabled = true;
  let idleTimer;

  // Hidden until the first move, otherwise it sits in the top-left corner.
  k.hidden(true);

  const wake = () => {
    k.hidden(false);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => k.hidden(true), Reveal.getConfig().hideCursorTime ?? 5000);
  };
  addEventListener('mousemove', () => enabled && wake());

  const toggle = () => {
    enabled = !enabled;
    document.body.classList.toggle('notCursor', enabled);
    if (enabled) {
      wake();
    } else {
      clearTimeout(idleTimer);
      k.hidden(true);
    }
  };

  const bind = () =>
    Reveal.addKeyBinding({ keyCode: 67, key: 'C', description: 'Toggle custom cursor' }, toggle);
  if (Reveal.isReady()) bind();
  else Reveal.on('ready', bind);
}
