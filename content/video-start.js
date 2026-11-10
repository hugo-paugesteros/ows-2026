// Videos whose src ends in #t=<start> (on the video or its <source>) start there: browsers do not
// always seek to a media fragment, so seek once the duration is known.

for (const video of document.querySelectorAll('.reveal .slides video')) {
    const src = video.getAttribute('src') ?? video.querySelector('source')?.getAttribute('src') ?? ''
    const start = Number(src.match(/#t=([\d.]+)/)?.[1])
    if (!start) continue
    const seek = () => {
        if (video.currentTime < start) video.currentTime = start
    }
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seek()
    else video.addEventListener('loadedmetadata', seek, { once: true })
}
