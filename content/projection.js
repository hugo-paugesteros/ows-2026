import data from './projection-data.js'

const S = 100, TILT = 0.5, TAU = 2 * Math.PI, AXIS = 1.1
const LABELS = { pca: ['PC1', 'PC2'], lda: ['LD1', 'LD2'] }

class Projection extends HTMLElement {

    phi = 0.6
    theta = TILT

    constructor() {
        super()

        const method = this.getAttribute('method')
        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host { display: block; width: 100%; }
                svg { display: block; width: 100%; height: 65vh; }
                circle { fill: var(--control); transition: fill 0.5s; }
                .c0 { fill: var(--k0); }
                .c1 { fill: var(--k1); }
                .c2 { fill: var(--ltas-mean); }
                :host([data-uncoloured]) circle { fill: var(--control); }
                .axes { transition: opacity 0.5s; }
                :host([data-step="1"]) .axes { opacity: 0; }
                line { stroke: var(--control); stroke-width: 0.8; }
                text { font-size: 9px; text-anchor: middle; fill: var(--control); }
            </style>
            <svg viewBox="-130 -130 260 260">
                <g class="axes">
                    <line/><line/>
                    <text>${LABELS[method][0]}</text><text>${LABELS[method][1]}</text>
                </g>
            </svg>
        `

        this.svg = SVG(shadow.querySelector('svg'))
        this.lines = [...shadow.querySelectorAll('line')].map(node => SVG(node))
        this.texts = [...shadow.querySelectorAll('text')].map(node => SVG(node))
        this.points = data[method]
        this.circles = this.points.map((_, i) => {
            const circle = this.svg.circle(3.5)
            return method === 'lda' ? circle.addClass(`c${data.labels[i]}`) : circle
        })
    }

    // Steps (1 + visible fragments): 1 the cloud spinning, 2 the axes, 3 flattened onto them.
    // The LDA starts with one more step, the cloud without its classes (as after the PCA).
    connectedCallback() {
        const lda = this.getAttribute('method') === 'lda'
        const update = () => {
            const step = 1 + this.closest('section').querySelectorAll('.fragment.visible').length
            this.toggleAttribute('data-uncoloured', lda && step === 1)
            this.dataset.step = lda ? Math.max(1, step - 1) : step
        }
        update()
        for (const event of ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden']) {
            Reveal.on(event, update)
        }
        let last = performance.now()
        const tick = now => {
            this.frame(Math.min((now - last) / 1000, 0.1))
            last = now
            requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
    }

    // Orthographic view; at phi = theta = 0 the screen shows axes 1 and 2, i.e. the projection.
    frame(dt) {
        if (!this.offsetParent) return
        const flat = this.dataset.step === '3'
        const ease = 1 - Math.exp(-4 * dt)
        this.theta += ((flat ? 0 : TILT) - this.theta) * ease
        this.phi += flat ? (Math.round(this.phi / TAU) * TAU - this.phi) * ease : 0.3 * dt

        const [cp, sp] = [Math.cos(this.phi), Math.sin(this.phi)]
        const [ct, st] = [Math.cos(this.theta), Math.sin(this.theta)]
        const view = ([x, y, z]) => {
            const z1 = z * cp - x * sp
            return [S * (x * cp + z * sp), -S * (y * ct - z1 * st), (y * st + z1 * ct + 1) / 2]
        }

        this.points.forEach((point, i) => {
            const [x, y, depth] = view(point)
            this.circles[i].attr({ cx: x, cy: y, opacity: 0.35 + 0.65 * depth })
        })

        for (const k of [0, 1]) {
            const axis = [0, 0, 0]
            axis[k] = AXIS
            const [x, y] = view(axis)
            axis[k] = -AXIS
            const [x0, y0] = view(axis)
            this.lines[k].plot(x0, y0, x, y)
            this.texts[k].attr({ x, y: y + 3 })
        }
    }

}

customElements.define('x-projection', Projection)
