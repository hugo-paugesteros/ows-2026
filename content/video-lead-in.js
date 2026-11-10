// A fragment with data-start-video="<selector of a later slide>" starts that slide's background video
// while still on the current slide, then moves to it once the video reaches data-land-at (seconds):
// the sound comes before the picture. Reveal does not restart a background video already playing.

let watch = null

function background(fragment) {
    const slide = document.querySelector(fragment.dataset.startVideo)
    const video = Reveal.getSlideBackground(slide)?.querySelector('video')
    if (!video) console.warn(`no background video loaded for ${fragment.dataset.startVideo}`)
    return { slide, video }
}

Reveal.on('fragmentshown', ({ fragment }) => {
    if (!fragment.dataset.startVideo) return
    const { slide, video } = background(fragment)
    if (!video) return
    const landAt = Number(fragment.dataset.landAt ?? 0)
    video.currentTime = 0
    video.play()
    const check = () => {
        if (video.currentTime < landAt) {
            watch = requestAnimationFrame(check)
            return
        }
        const { h, v } = Reveal.getIndices(slide)
        Reveal.slide(h, v)
    }
    watch = requestAnimationFrame(check)
})

// Stepping back before landing silences the video
Reveal.on('fragmenthidden', ({ fragment }) => {
    if (!fragment.dataset.startVideo) return
    cancelAnimationFrame(watch)
    const { video } = background(fragment)
    video?.pause()
    if (video) video.currentTime = 0
})

// Landed, by itself or by an early press: stop watching
Reveal.on('slidechanged', () => cancelAnimationFrame(watch))
