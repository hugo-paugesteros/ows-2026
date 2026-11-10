import * as d3 from 'd3'
import { violinIcon } from './pictogram.js'

const VIOLINS = [['Klimke', 'Violon Test'], ['Levaggi', 'Violon Témoin 1'], ['Stoppani', 'Violon Témoin 2']]
// const VIOLINS = [['Klimke', 'Violon Test'], ['Levaggi', 'Violon Témoin 1']]
const PHASES = [['before', 'Avant'], ['after', 'Après']]
const GAP = 15
const M = { top: 10, right: 100, bottom: 50, left: 130 }

// Mean of the linear amplitudes (quadratic), back in dB
const meanDb = values => 10 * Math.log10(d3.mean(values, v => 10 ** (v / 10)))

// One point per frequency: mean line and min-max band over the measurements.
// Some measurements have a finer frequency grid: keep only the shared frequencies.
const summarize = rows => {
    const n = new Set(rows.map(d => d.measurement_id)).size
    return d3.rollups(rows, v => v.map(d => d.amplitude), d => d.frequency)
        .filter(([, a]) => a.length === n)
        .map(([frequency, a]) => ({ frequency, mean: meanDb(a), min: d3.min(a), max: d3.max(a) }))
        .sort((a, b) => a.frequency - b.frequency)
}

class Admittances extends HTMLElement {

    constructor() {
        super()

        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host { display: block; width: 100%; height: 60vh; margin: 0 auto; }
                svg { display: block; width: 100%; height: 100%; overflow: visible; }
                text { font: 14px var(--font); fill: var(--control); }
                .line { fill: none; stroke-width: 1.5; }
                .band { stroke: none; opacity: 0.3; }
                .line.before { stroke: black; }
                .line.after { stroke: darkgrey; }
                .band.before { fill: black; }
                .band.after { fill: darkgrey; }
            </style>
            <svg></svg>
        `
        this.svg = d3.select(shadow.querySelector('svg'))
        this.data = d3.csv('data/admittances-amplitude.csv', d3.autoType).then(rows => ({
            extent: d3.extent(rows, d => d.amplitude),
            curves: d3.rollup(rows, summarize, d => d.violin, d => d.phase),
        }))
    }

    // The figure takes the size of the element: redraw whenever it changes
    connectedCallback() {
        this.observer = new ResizeObserver(() => this.render())
        this.observer.observe(this)
    }

    disconnectedCallback() {
        this.observer.disconnect()
    }

    async render() {
        const { extent, curves } = await this.data
        const W = this.clientWidth, H = this.clientHeight
        if (!W || !H) return
        this.svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove()

        const rowH = (H - M.top - M.bottom) / VIOLINS.length
        const x = d3.scaleLog([180, 5000], [M.left, W - M.right])
        const y = d3.scaleLinear(extent, [rowH - GAP, 0]).nice()
        // const area = d3.area().x(d => x(d.frequency)).y0(d => y(d.min)).y1(d => y(d.max))
        const line = d3.line().x(d => x(d.frequency)).y(d => y(d.mean))

        VIOLINS.forEach(([violin, label], i) => {
            const g = this.svg.append('g').attr('transform', `translate(0, ${M.top + i * rowH})`)
            for (const [phase] of PHASES) {
                const data = curves.get(violin).get(phase)
                // g.append('path').attr('class', `band ${phase}`).attr('d', area(data))
                g.append('path').attr('class', `line ${phase}`).attr('d', line(data))
            }
            g.append('g')
                .attr('transform', `translate(${M.left}, 0)`)
                .call(d3.axisLeft(y).ticks(4))
            g.append('g')
                .attr('transform', `translate(0, ${rowH - GAP})`)
                .call(d3.axisBottom(x).tickValues([200, 500, 1000, 5000]).tickFormat(i === VIOLINS.length - 1 ? d3.format('') : ''))
            violinIcon(g, violin, M.left - 80, (rowH - GAP) / 2)
            g.append('text')
                .attr('transform', `translate(${M.left - 45}, ${(rowH - GAP) / 2}) rotate(-90)`)
                .attr('text-anchor', 'middle')
                .text(label)
        })

        this.svg.append('text')
            .attr('transform', `translate(15, ${M.top + (H - M.top - M.bottom) / 2}) rotate(-90)`)
            .attr('text-anchor', 'middle')
            .text('Amplitude (dB)')
        this.svg.append('text')
            .attr('x', (M.left + W - M.right) / 2)
            .attr('y', H - 5)
            .attr('text-anchor', 'middle')
            .text('Fréquence (Hz)')

        const legend = this.svg.append('g').attr('transform', `translate(${W - M.right + 20}, ${H / 2 - 20})`)
        PHASES.forEach(([phase, label], i) => {
            legend.append('path').attr('class', `line ${phase}`).attr('d', `M0,${i * 25}h20`)
            legend.append('text').attr('x', 28).attr('y', i * 25).attr('dy', '0.35em').text(label)
        })
    }
}

customElements.define('x-admittances', Admittances)
