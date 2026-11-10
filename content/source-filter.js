import { logT, radiativity } from './spectrum.js'
import {
    atoms, F0_REF, FILTER_MEAN, Estimator, harmonics, makeFrame, random, randomFrame,
} from './source-filter-model.js'

// Slide steps (1 + visible fragments): 1 the model, recording = source × filter, both unknown;
// then recording ÷ source = filter, and the steps below (step - 1):
// 1 a recorded frame; 2 the dictionary; 3 pitch shift, closest atom, it becomes the source;
// 4 what remains goes to the filter; 5 every frame of the recording; 6 comparison with the true filter
const N_FRAMES = 60
const DEMO = makeFrame(440, 0, random(1))

const PANEL_Y = 14, PANEL_H = 58, PANEL_W = 84
const PANELS = { obs: 4, source: 108, filter: 212 }
const CARD_Y = 107, CARD_W = 64, CARD_H = 32, CARD_X = [42, 118, 194]
const BAR_Y = CARD_Y + CARD_H + 3, BAR_W = 40

const ease = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
const lerp = (a, b, t) => a + (b - a) * t
const extent = values => [Math.min(...values) - 3, Math.max(...values) + 3]
const setClass = (element, name, on) => on ? element.addClass(name) : element.removeClass(name)

class SourceFilter extends HTMLElement {

    step = 0
    run = 0
    played = 0

    constructor() {
        super()

        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host { display: block; width: 100%; }
                svg { display: block; width: 100%; max-height: 66vh; overflow: visible; }
                text { font-family: var(--font); fill: var(--control); text-anchor: middle; }
                .title { font-size: 6px; }
                .op { font-size: 12px; dominant-baseline: central; }
                .small { font-size: 4.5px; }
                text[text-anchor="start"] { text-anchor: start; }
                text[text-anchor="end"] { text-anchor: end; }
                .unknown { font-size: 22px; fill: lightgrey; dominant-baseline: central; transition: opacity 0.5s; }
                .axis { stroke: lightgrey; stroke-width: 0.4; }
                .target { fill: none; stroke: var(--test); stroke-width: 0.8; }
                .fade { transition: opacity 0.5s; }
                .hidden { opacity: 0; }
                .a0 { --c: var(--k0); }
                .a1 { --c: var(--k1); }
                .a2 { --c: var(--k2); }
                .obs { --c: var(--test); }
                .comb line { stroke: var(--c); stroke-width: 0.35; }
                .comb circle { fill: var(--c); }
                .card rect { fill: none; stroke: lightgrey; stroke-width: 0.5; transition: stroke 0.4s; }
                .card.best rect { stroke: var(--c); stroke-width: 0.9; }
                .card, .bar { transition: opacity 0.4s; }
                .dim { opacity: 0.25; }
                .bar rect { fill: var(--c); }
                .accum circle { opacity: 0.45; }
                .estimate { fill: none; stroke: var(--ltas-mean); stroke-width: 0.8; }
                .truth { fill: none; stroke: var(--control); stroke-width: 0.4; }
                .ltas { fill: none; stroke: var(--ltas-accum); stroke-width: 0.6; stroke-dasharray: 1.5 1; }
            </style>
            <svg viewBox="0 0 300 154"></svg>
        `
        this.svg = SVG(shadow.querySelector('svg'))

        // Every frame and its fit are fixed in advance: the demo is the same at every rehearsal
        const rand = random(7)
        this.frames = Array.from({ length: N_FRAMES }, () => randomFrame(rand))
        const estimator = new Estimator()
        this.fits = [DEMO, ...this.frames].map(frame => {
            const fit = estimator.fit(frame)
            estimator.add(frame, fit)
            return fit
        })
        this.demoFit = this.fits.shift()

        const all = [[DEMO, this.demoFit], ...this.frames.map((frame, i) => [frame, this.fits[i]])]
        this.obsRange = extent(all.flatMap(([frame, { candidates, best }]) => [
            ...frame.obs, ...frame.ks.map(k => atoms[best][k - 1] + candidates[best].offset),
        ]))
        this.filterRange = extent([
            ...all.flatMap(([, { candidates, best }]) => candidates[best].residual.map(r => r + FILTER_MEAN)),
            ...radiativity.map(([, db]) => db),
            ...estimator.ltasCurve().filter(Boolean).map(([, db]) => db),
        ])
        this.cardRange = extent(atoms.flat())
        this.maxError = Math.max(...all.flatMap(([frame, { candidates }]) => candidates.map(c => this.rms(frame, c))))

        this.build()
    }

    rms(frame, candidate) {
        return Math.sqrt(candidate.error / frame.ks.length)
    }

    // Plot regions: x on the log frequency axis, y in dB within the region's range
    region(x0, y0, w, h, range) {
        return {
            x: freq => x0 + logT(freq) * w,
            y: db => y0 + (1 - Math.max(0, Math.min(1, (db - range[0]) / (range[1] - range[0])))) * h,
            base: y0 + h,
        }
    }

    build() {
        const svg = this.svg
        const title = (x, text) => svg.plain(text).addClass('title').attr({ x: x + PANEL_W / 2, y: 9 })
        title(PANELS.obs, 'Enregistrement')
        title(PANELS.source, 'Source (corde)')
        title(PANELS.filter, 'Filtre (violon)')
        // The filter is what we are after: framed in red, title included
        svg.rect(PANEL_W + 6, PANEL_Y + PANEL_H + 1).move(PANELS.filter - 3, 2).radius(3).addClass('target')
        this.signs = [PANELS.source, PANELS.filter]
            .map(x => svg.plain('').addClass('op').attr({ x: x - 10, y: PANEL_Y + PANEL_H / 2 }))

        this.r = {
            obs: this.region(PANELS.obs, PANEL_Y, PANEL_W, PANEL_H, this.obsRange),
            source: this.region(PANELS.source, PANEL_Y, PANEL_W, PANEL_H, this.obsRange),
            filter: this.region(PANELS.filter, PANEL_Y, PANEL_W, PANEL_H, this.filterRange),
        }
        for (const x of Object.values(PANELS)) {
            svg.line(x, PANEL_Y + PANEL_H, x + PANEL_W, PANEL_Y + PANEL_H).addClass('axis')
        }
        this.f0Label = svg.plain('').addClass('small').attr({ x: PANELS.obs + PANEL_W, y: PANEL_Y + 3, 'text-anchor': 'end' })
        this.unknown = {
            source: svg.plain('?').addClass('unknown').attr({ x: PANELS.source + PANEL_W / 2, y: PANEL_Y + PANEL_H / 2 }),
            filter: svg.plain('?').addClass('unknown').attr({ x: PANELS.filter + PANEL_W / 2, y: PANEL_Y + PANEL_H / 2 }),
        }

        this.obsComb = svg.group().addClass('comb obs')
        this.sourceComb = svg.group().addClass('comb')
        this.accum = svg.group().addClass('comb accum')
        this.live = svg.group().addClass('comb')
        this.curves = svg.group()
        this.truth = svg.group().addClass('fade')
        this.truth.polyline(radiativity.map(([freq, db]) => [this.r.filter.x(freq), this.r.filter.y(db)])).addClass('truth')
        this.ltas = this.truth.group()
        this.legend(this.truth)

        // Dictionary: one card per atom, each clipped to its frame so the pitch shift can slide it
        this.dictionary = svg.group().addClass('fade')
        this.dictionary.plain('Dictionnaire de sources, mesuré sur des cordes seules par Jim Woodhouse')
            .addClass('small').attr({ x: 150, y: CARD_Y - 4 })
        this.dictionary.plain('écart').addClass('small').attr({ x: CARD_X[0] - 8, y: BAR_Y + 3 })
        this.cards = atoms.map((_, j) => {
            const x0 = CARD_X[j]
            const card = this.dictionary.group().addClass(`card a${j}`)
            card.rect(CARD_W, CARD_H).move(x0, CARD_Y).radius(2)
            const clip = svg.clip().add(svg.rect(CARD_W - 2, CARD_H - 2).move(x0 + 1, CARD_Y + 1))
            const comb = card.group().addClass('comb').clipWith(clip)
            const bar = this.dictionary.group().addClass(`bar a${j}`)
            return {
                card, comb, bar,
                region: this.region(x0 + 2, CARD_Y + 2, CARD_W - 4, CARD_H - 4, this.cardRange),
                rect: bar.rect(0, 2.5).move(x0, BAR_Y),
                value: bar.plain('').addClass('small').attr({ x: x0 + BAR_W + 3, y: BAR_Y + 2.5, 'text-anchor': 'start' }),
            }
        })

        this.flying = svg.group().addClass('comb')
    }

    legend(group) {
        const x = PANELS.filter + 2, items = [
            ['estimate', 'estimé (source retirée)'],
            ['ltas', 'spectre moyen'],
            ['truth', 'vrai filtre'],
        ]
        items.forEach(([cls, label], i) => {
            const y = PANEL_Y + PANEL_H + 6 + 5.5 * i
            group.line(x, y, x + 6, y).addClass(cls)
            group.plain(label).addClass('small').attr({ x: x + 8, y: y + 1.5, 'text-anchor': 'start' })
        })
    }

    connectedCallback() {
        const update = () => {
            const section = this.closest('section')
            if (section !== Reveal.getCurrentSlide()) {
                this.run++
                return
            }
            const step = 1 + section.querySelectorAll('.fragment.visible').length
            this.setModel(step === 1)
            this.setStep(Math.max(1, step - 1))
        }
        for (const event of ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden']) {
            Reveal.on(event, update)
        }
        this.setModel(true)
        this.render(1)
    }

    // The model (recording = source × filter), or its inversion (recording ÷ source = filter)
    setModel(model) {
        const [first, second] = model ? ['=', '×'] : ['÷', '=']
        this.signs[0].plain(first)
        this.signs[1].plain(second)
    }

    setStep(step) {
        const previous = this.step
        this.step = step
        this.run++
        if (step === previous + 1 && step > 2) {
            this.render(previous)
            this.animate(step)
        } else {
            this.render(step)
        }
    }

    // Resolves to false as soon as the step changes, so a sequence stops where it is
    tween(ms, draw = () => { }) {
        const run = this.run
        return new Promise(resolve => {
            const start = performance.now()
            const tick = now => {
                if (run !== this.run) return resolve(false)
                const t = Math.min(1, (now - start) / ms)
                draw(ease(t))
                if (t < 1) requestAnimationFrame(tick)
                else resolve(true)
            }
            requestAnimationFrame(tick)
        })
    }

    // Harmonic comb, points given in SVG coordinates as [x, y, base]
    comb(group, points, { stems = true, r = 1.1 } = {}) {
        group.clear()
        for (const [x, y, base] of points) {
            if (stems) group.line(x, base, x, y)
            group.circle(2 * r).center(x, y)
        }
    }

    drawObs(frame) {
        const { x, y, base } = this.r.obs
        this.comb(this.obsComb, frame.ks.map((k, i) => [x(k * frame.f0), y(frame.obs[i]), base]))
        this.f0Label.plain(`f₀ = ${Math.round(frame.f0)} Hz`)
    }

    // Atoms of the dictionary, pitch shifted from F0_REF to f0: a translation on the log axis
    drawCards(f0) {
        for (const [j, { comb, region }] of this.cards.entries()) {
            this.comb(comb, atoms[j].map((db, i) => [region.x((i + 1) * f0), region.y(db), region.base]), { r: 0.8 })
        }
    }

    // Errors of each atom, and the closest one highlighted
    drawFit(frame, fit, t = 1) {
        for (const [j, { rect, value }] of this.cards.entries()) {
            const error = this.rms(frame, fit.candidates[j])
            rect.width(t * BAR_W * error / this.maxError)
            value.plain(t === 1 ? `${error.toFixed(1)} dB` : '')
        }
    }

    highlight(best) {
        for (const [j, { card, bar }] of this.cards.entries()) {
            setClass(card, 'best', j === best)
            setClass(card, 'dim', best !== null && j !== best)
            setClass(bar, 'dim', best !== null && j !== best)
        }
    }

    sourcePoints(frame, { candidates, best }) {
        const { x, y, base } = this.r.source
        return frame.ks.map(k => [x(k * frame.f0), y(atoms[best][k - 1] + candidates[best].offset), base])
    }

    drawSource(frame, fit) {
        this.sourceComb.attr('class', `comb a${fit.best}`)
        this.comb(this.sourceComb, this.sourcePoints(frame, fit))
    }

    residualPoints(frame, { candidates, best }) {
        const { x, y } = this.r.filter
        return frame.ks.map((k, i) => [x(k * frame.f0), y(candidates[best].residual[i] + FILTER_MEAN)])
    }

    // The frame just fitted is drawn bigger, earlier ones join the accumulated cloud
    drawResidual(frame, fit) {
        const previous = this.live.children()
        if (previous.length) {
            const group = this.accum.group().attr('class', this.live.attr('class'))
            previous.forEach(circle => circle.radius(0.6).addTo(group))
        }
        this.live.attr('class', `comb a${fit.best}`)
        this.comb(this.live, this.residualPoints(frame, fit), { stems: false, r: 1.1 })
    }

    drawCurves() {
        this.curves.clear()
        this.polylines(this.curves, this.estimator.filterCurve(), 'estimate')
        this.ltas.clear()
        this.polylines(this.ltas, this.estimator.ltasCurve(), 'ltas')
    }

    // One polyline per run of consecutive bins, holes where no harmonic fell
    polylines(group, curve, cls) {
        const { x, y } = this.r.filter
        let segment = []
        for (const bin of [...curve, null]) {
            if (bin) {
                segment.push([x(bin[0]), y(bin[1])])
                continue
            }
            if (segment.length > 1) group.polyline(segment).addClass(cls)
            segment = []
        }
    }

    // State of a step, drawn at once (going back, or arriving on the slide)
    render(step) {
        if (step < 5) this.played = 0
        if (step >= 6) this.played = N_FRAMES
        const n = this.played
        const frame = n ? this.frames[n - 1] : DEMO
        const fit = n ? this.fits[n - 1] : this.demoFit

        this.drawObs(frame)
        setClass(this.dictionary, 'hidden', step < 2)
        this.drawCards(step >= 3 ? frame.f0 : F0_REF)
        this.drawFit(frame, fit, step >= 3 ? 1 : 0)
        this.highlight(step >= 3 ? fit.best : null)
        setClass(this.unknown.source, 'hidden', step >= 3)
        setClass(this.unknown.filter, 'hidden', step >= 4)
        this.flying.clear()

        this.sourceComb.clear()
        if (step >= 3) this.drawSource(frame, fit)

        this.estimator = new Estimator()
        this.accum.clear()
        this.live.clear()
        if (step >= 4) {
            this.estimator.add(DEMO, this.demoFit)
            this.drawResidual(DEMO, this.demoFit)
            for (let i = 0; i < n; i++) {
                this.estimator.add(this.frames[i], this.fits[i])
                this.drawResidual(this.frames[i], this.fits[i])
            }
        }
        this.curves.clear()
        this.ltas.clear()
        if (step >= 5) this.drawCurves()
        setClass(this.truth, 'hidden', step < 6)
    }

    async animate(step) {
        const frame = DEMO, fit = this.demoFit

        if (step === 3) {
            // Pitch shift of every atom to the frame's f0
            if (!await this.tween(900, t => this.drawCards(F0_REF * Math.pow(frame.f0 / F0_REF, t)))) return
            if (!await this.tween(600, t => this.drawFit(frame, fit, t))) return
            this.drawFit(frame, fit)
            this.highlight(fit.best)
            if (!await this.tween(500)) return

            // The closest atom, brought to the frame's level, is the source
            const { region } = this.cards[fit.best]
            const from = frame.ks.map(k => [region.x(k * frame.f0), region.y(atoms[fit.best][k - 1]), region.base])
            const to = this.sourcePoints(frame, fit)
            this.flying.attr('class', `comb a${fit.best}`)
            this.unknown.source.addClass('hidden')
            if (!await this.tween(900, t => this.comb(this.flying,
                from.map((p, i) => p.map((v, c) => lerp(v, to[i][c], t))), { r: lerp(0.8, 1.1, t) }))) return
            this.flying.clear()
            this.drawSource(frame, fit)
        }

        if (step === 4) {
            // What remains of the recording once the source is removed
            const { x, y } = this.r.obs
            const from = frame.ks.map((k, i) => [x(k * frame.f0), y(frame.obs[i])])
            const to = this.residualPoints(frame, fit)
            this.flying.attr('class', 'comb obs')
            this.unknown.filter.addClass('hidden')
            if (!await this.tween(1200, t => this.comb(this.flying,
                from.map((p, i) => p.map((v, c) => lerp(v, to[i][c], t))), { stems: false }))) return
            this.flying.clear()
            this.estimator.add(frame, fit)
            this.drawResidual(frame, fit)
        }

        if (step === 5) {
            this.drawCurves()
            while (this.played < N_FRAMES) {
                if (!await this.playFrame(this.played)) return
            }
        }

        if (step === 6) {
            this.render(6)
        }
    }

    // One frame of the recording, faster and faster
    async playFrame(i) {
        const frame = this.frames[i], fit = this.fits[i]
        const previous = i ? this.frames[i - 1] : DEMO
        const duration = 150 + 1100 * Math.pow(0.85, i)

        this.drawObs(frame)
        if (!await this.tween(0.4 * duration,
            t => this.drawCards(previous.f0 * Math.pow(frame.f0 / previous.f0, t)))) return false
        this.drawFit(frame, fit)
        this.highlight(fit.best)
        this.drawSource(frame, fit)
        this.estimator.add(frame, fit)
        this.drawResidual(frame, fit)
        this.drawCurves()
        this.played = i + 1
        return this.tween(0.6 * duration)
    }
}

customElements.define('x-source-filter', SourceFilter)
