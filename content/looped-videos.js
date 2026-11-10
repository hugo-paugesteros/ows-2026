// Videos with class "looped" play muted in a loop while their slide is shown; a src ending in
// #t=start,end loops that segment only. In a .card-grid, a card's video plays only once, while that card is in focus.

function setup() {
    for (const video of document.querySelectorAll('video.looped')) {
        const [, path, start = '0', end] = video.getAttribute('src').match(/^([^#]*)(?:#t=([\d.]+)(?:,([\d.]+))?)?/)
        video.segment = { start: Number(start), end: end ? Number(end) : Infinity }
        // We loop the segment ourselves: keep #t=start for the first frame, drop the end so the browser does not pause there
        video.src = `${path}#t=${start}`
        video.muted = true
        video.playsInline = true
    }
}

function videos(slide) {
    return slide ? slide.querySelectorAll('video.looped') : []
}

// A card of a .card-grid is in focus at step i (see main.css), out of focus before and after
function focused(video) {
    const card = video.closest('.card-grid > *')
    if (!card) return true
    const step = card.closest('section').querySelectorAll('.fragment[data-step].visible').length
    return card === card.parentElement.children[step - 1]
}

function play(video) {
    cancelAnimationFrame(video.watch)
    const once = video.closest('.card-grid > *')
    const tick = () => {
        if (video.currentTime >= video.segment.end || video.ended) {
            // Keep video.watch, so that the video is not started again while in focus
            if (once) return video.pause()
            video.currentTime = video.segment.start
            video.play()
        }
        video.watch = requestAnimationFrame(tick)
    }
    video.currentTime = video.segment.start
    video.play()
    video.watch = requestAnimationFrame(tick)
}

function stop(video) {
    cancelAnimationFrame(video.watch)
    video.watch = null
    video.pause()
}

// Plays the videos of a slide that should play, stops the others, leaves the playing ones running
function update(slide) {
    for (const video of videos(slide)) {
        if (!focused(video)) stop(video)
        else if (!video.watch) play(video)
    }
}

function start() {
    setup()
    update(Reveal.getCurrentSlide())
    Reveal.on('slidechanged', ({ previousSlide, currentSlide }) => {
        videos(previousSlide).forEach(stop)
        update(currentSlide)
    })
    for (const event of ['fragmentshown', 'fragmenthidden']) Reveal.on(event, () => update(Reveal.getCurrentSlide()))
}

if (Reveal.isReady()) start()
else Reveal.on('ready', start)
