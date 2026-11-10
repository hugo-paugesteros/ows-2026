const DURATION = 5          // s, time for the box to reach the center
const SPEED = 0.35          // screen widths per second

// Position along a segment of length L for a point bouncing between 0 and L
function fold(u, L) {
    if (L <= 0) return 0
    const m = ((u % (2 * L)) + 2 * L) % (2 * L)
    return m <= L ? m : 2 * L - m
}

function randomAngle() {
    const quadrant = Math.floor(Math.random() * 4)
    const offset = (25 + Math.random() * 40) * Math.PI / 180
    return quadrant * Math.PI / 2 + offset
}

class NoSignal extends HTMLElement {

    constructor() {
        super()

        // The screen is drawn in the slide background: it covers the whole viewport and is not scaled by Reveal
        this.layer = document.createElement('div')
        this.layer.style.cssText = 'position: absolute; inset: 0;'
        const shadow = this.layer.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                .screen {
                    position: absolute;
                    inset: 0;
                    overflow: hidden;
                    container-type: size;
                    background:
                        repeating-linear-gradient(90deg, rgb(0 0 0 / 0.06) 0 1px, transparent 1px 3px),
                        repeating-linear-gradient(0deg, rgb(0 0 0 / 0.06) 0 1px, transparent 1px 3px),
                        radial-gradient(ellipse at 45% 45%, rgb(40 90 255), rgb(8 30 235) 60%, rgb(5 20 190));
                    font-family: Arial, Helvetica, sans-serif;
                    color: white;
                }
                .box {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 24.5cqw;
                    aspect-ratio: 3.1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                    border: max(2px, 0.25cqw) solid rgb(225 230 240);
                    border-radius: 0.9cqw;
                    background: rgb(75 88 130 / 0.92);
                    font-size: 2.3cqw;
                    letter-spacing: 0.12em;
                    will-change: transform;
                }
                .productions {
                    position: absolute;
                    left: 0;
                    right: 0;
                    top: calc(50% + 7cqw);
                    text-align: center;
                    font-size: 2.3cqw;
                    letter-spacing: 0.3em;
                    opacity: 0;
                    transform: translateY(1cqw);
                    transition: opacity 1.5s ease, transform 1.5s ease;
                }
                .done .productions {
                    opacity: 1;
                    transform: none;
                }
            </style>
            <div class="screen">
                <div class="box">NO SIGNAL</div>
                <div class="productions">productions</div>
            </div>
        `
        this.screen = shadow.querySelector('.screen')
        this.box = shadow.querySelector('.box')
    }

    connectedCallback() {
        this.style.display = 'none'
        this.section = this.closest('section')

        const update = () => {
            const background = Reveal.getSlideBackground(this.section)
            if (background && !background.contains(this.layer)) background.append(this.layer)
            const current = Reveal.getCurrentSlide() === this.section
            // Used in main.css to hide the slide number
            document.documentElement.classList.toggle('no-signal', current)
            if (current) this.start()
            else this.stop()
        }
        if (Reveal.isReady()) update()
        for (const event of ['ready', 'slidechanged']) Reveal.on(event, update)
        Reveal.on('resize', () => this.frame && this.place(this.t))
    }

    start() {
        if (this.frame) return
        const angle = randomAngle()
        this.direction = [Math.cos(angle), Math.sin(angle)]
        this.screen.classList.remove('done')
        this.place(0)
        // The clock starts on the first rendered frame, in case the slide change blocks the main thread
        let t0
        const tick = now => {
            t0 ??= now
            const t = Math.min((now - t0) / 1000, DURATION)
            this.place(t)
            if (t < DURATION) {
                this.frame = requestAnimationFrame(tick)
            } else {
                this.screen.classList.add('done')
            }
        }
        this.frame = requestAnimationFrame(tick)
    }

    stop() {
        cancelAnimationFrame(this.frame)
        this.frame = null
        this.screen.classList.remove('done')
    }

    // The box ends at the center at t = DURATION: its position at t is found by going back in time from there
    place(t) {
        this.t = t
        const W = this.screen.clientWidth, H = this.screen.clientHeight
        const w = this.box.offsetWidth, h = this.box.offsetHeight
        const back = SPEED * W * (DURATION - t)
        const x = fold((W - w) / 2 - this.direction[0] * back, W - w)
        const y = fold((H - h) / 2 - this.direction[1] * back, H - h)
        this.box.style.transform = `translate(${x}px, ${y}px)`
    }

}

customElements.define('no-signal', NoSignal)
