import data from './impulse-data.js'

const FMIN = 200, FMAX = 5000
const T = 0.005, SAMPLES = 401
const DB_MIN = -40
const ICON = new URL('./images/icons.svg#violin', import.meta.url).href
// Step 1, click a signal to hear it: the string alone, or through the violin body
const SOUNDS = { in: 'sounds/string.wav', out: 'sounds/string-violin.wav' }

const time = Array.from({ length: SAMPLES }, (_, i) => (i / (SAMPLES - 1) - 0.5) * T)
const at = f => Math.round(f - data.fmin)
const frequency = value => FMIN * (FMAX / FMIN) ** (value / 1000)  // slider value (0 - 1000) to Hz, log scale
const cos = (f, phase = 0) => time.map(t => Math.cos(2 * Math.PI * f * t + phase))

const impulse = data.impulse.map((_, i) => i === data.zero ? 1 : 0)

// A signal over time (x from 0 to 100), on a time axis through 0 running a little past it, to 105
function plot(svg, ys) {
    svg.line(0, 20, 105, 20).addClass('axis')
    svg.polyline([[103, 18.8], [105, 20], [103, 21.2]]).addClass('axis')
    svg.plain('t').attr({ x: 106, y: 20 }).addClass('axis-label')
    svg.polyline(ys.map((y, i) => [i / (ys.length - 1) * 100, 20 - 18 * y]))
}

class Impulse extends HTMLElement {

    constructor() {
        super()

        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host { display: block; width: 100%; }
                svg { width: 100%; display: block; }
                polyline { fill: none; stroke: var(--control); stroke-width: 0.6; }
                .dots circle { fill: var(--ltas-accum); }
                .current { fill: var(--test); }
                .layout { display: grid; grid-template-columns: 1fr auto 6em auto 1fr; align-items: center; gap: 0.5em; }
                .response, .freq, .freq-label { grid-column: 1 / -1; visibility: hidden; }
                :host([data-step="2"]) :is(.response, .freq, .freq-label) { visibility: visible; }
                .freq-label { font-size: 0.5em; color: #888; text-align: center; }
                .box { border: 2px solid var(--control); border-radius: 8px; padding: 0.5em; }
                .arrow { font-size: 1.6rem; text-align: center; }
                :host([data-step="1"]) .in, :host([data-step="1"]) .out { cursor: pointer; }
                .playing polyline:not(.axis) { stroke: var(--test); }
                .axis { stroke: #888; stroke-width: 0.5; }
                .axis-label { font: 4px var(--font); fill: #888; dominant-baseline: middle; }
            </style>
            <div class="layout">
                <svg class="in" viewBox="0 0 109 40"></svg>
                <span class="arrow">&rarr;</span>
                <div class="box"><svg viewBox="0 0 36 36"><use href="${ICON}"/></svg></div>
                <span class="arrow">&rarr;</span>
                <svg class="out" viewBox="0 0 109 40"></svg>
                <svg class="response" viewBox="0 0 100 25"></svg>
                <input class="freq" type="range" min="0" max="1000" value="300">
                <span class="freq-label">Fréquence</span>
            </div>
        `

        const $ = selector => shadow.querySelector(selector)
        this.in = SVG($('.in'))
        this.out = SVG($('.out'))
        this.response = SVG($('.response'))
        this.freq = $('.freq')

        this.dots = this.response.group().addClass('dots')
        this.current = this.response.circle(2.5).addClass('current')

        this.sampled = new Set()
        this.last = Number(this.freq.value)
        this.freq.addEventListener('input', () => {
            this.signals()
            this.sample()
        })
        this.sample()

        this.audio = new Audio()
        this.audio.addEventListener('ended', () => this.play(null))
        for (const side of ['in', 'out']) {
            $(`.${side}`).addEventListener('click', () => {
                if (this.dataset.step === '1') this.play(side === this.playing ? null : side)
            })
        }
    }

    connectedCallback() {
        const update = () => {
            const section = this.closest('section')
            const step = 1 + section.querySelectorAll('.fragment.visible').length
            if (this.dataset.step != step || section !== Reveal.getCurrentSlide()) this.play(null)
            if (this.dataset.step != step) {
                this.dataset.step = step
                this.signals()
            }
        }
        update()
        for (const event of ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden']) {
            Reveal.on(event, update)
        }
    }

    get f() {
        return frequency(this.freq.value)
    }

    signals() {
        this.in.clear()
        this.out.clear()
        if (this.dataset.step === '1') {
            plot(this.in, data.string)
            plot(this.out, data.stringOut)
        } else if (this.dataset.step === '2') {
            const i = at(this.f)
            plot(this.in, cos(this.f))
            plot(this.out, cos(this.f, data.phase[i]).map(y => y * data.magnitude[i]))
        } else {
            plot(this.in, impulse)
            plot(this.out, data.impulse)
        }
    }

    // Plays the sound of a side ('in' or 'out'), or stops with null
    play(side) {
        this.playing = side
        if (side) {
            this.audio.src = SOUNDS[side]
            this.audio.play()
        } else {
            this.audio.pause()
        }
        this.in.node.classList.toggle('playing', side === 'in')
        this.out.node.classList.toggle('playing', side === 'out')
    }

    // Adds a point for every slider value between the previous one and the current one: the input events
    // of a fast move skip values, the curve does not
    sample() {
        const value = Number(this.freq.value)
        for (let v = Math.min(this.last, value); v <= Math.max(this.last, value); v++) {
            if (this.sampled.has(v)) continue
            this.sampled.add(v)
            this.dots.circle(1).center(...this.point(v))
        }
        this.last = value
        this.current.center(...this.point(value))
    }

    // Position of the response at a slider value: log frequency, magnitude in dB
    point(value) {
        const db = 20 * Math.log10(data.magnitude[at(frequency(value))])
        return [value / 10, 1 + 23 * (1 - (db - DB_MIN) / -DB_MIN)]
    }

}

customElements.define('x-impulse', Impulse)
