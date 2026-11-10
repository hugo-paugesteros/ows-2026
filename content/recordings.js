import * as d3 from 'd3'
import { violinIcon } from './pictogram.js'

const VIOLINS = [['Klimke', 'Test Violin'], ['Levaggi', 'Control Violin 1'], ['Stoppani', 'Control Violin 2']]
const PHASES = [['before', 'Before'], ['after', 'After']]
const GAP = 15
const M = { top: 10, right: 100, bottom: 50, left: 130 }

// One point per frequency: mean over the takes and its 95% confidence interval
const summarize = rows => d3.rollups(rows, v => {
    const a = v.map(d => d.amplitude)
    const mean = d3.mean(a)
    const ci = 1.96 * Math.sqrt(d3.mean(a, x => (x - mean) ** 2) / a.length)
    return { mean, min: mean - ci, max: mean + ci }
}, d => d.frequency)
    .map(([frequency, s]) => ({ frequency, ...s }))
    .sort((a, b) => a.frequency - b.frequency)

class Recordings extends HTMLElement {

    static observedAttributes = ['scope']

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
        this.data = d3.csv('data/recordings-ltas.csv', d3.autoType)
            .then(rows => d3.rollup(rows, summarize, d => d.scope, d => d.violin, d => d.phase))
    }

    // The figure takes the size of the element: redraw whenever it changes
    connectedCallback() {
        this.observer = new ResizeObserver(() => this.render())
        this.observer.observe(this)
    }

    disconnectedCallback() {
        this.observer.disconnect()
    }

    attributeChangedCallback() {
        this.render()
    }

    // scope="control" (control group) or scope="test" (Test violinist)
    async render() {
        const scope = this.getAttribute('scope') ?? 'control'
        const curves = (await this.data).get(scope)
        const W = this.clientWidth, H = this.clientHeight
        if (!W || !H) return
        this.svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove()

        // The Test violinist has only 1 or 2 takes per violin and phase: no confidence band
        const band = scope === 'control'
        const points = [...curves.values()].flatMap(phases => [...phases.values()].flat())
        const extent = band ? [d3.min(points, d => d.min), d3.max(points, d => d.max)] : d3.extent(points, d => d.mean)

        const rowH = (H - M.top - M.bottom) / VIOLINS.length
        const x = d3.scaleLog([200, 5000], [M.left, W - M.right])
        const y = d3.scaleLinear(extent, [rowH - GAP, 0]).nice()
        const area = d3.area().x(d => x(d.frequency)).y0(d => y(d.min)).y1(d => y(d.max))
        const line = d3.line().x(d => x(d.frequency)).y(d => y(d.mean))

        VIOLINS.forEach(([violin, label], i) => {
            const g = this.svg.append('g').attr('transform', `translate(0, ${M.top + i * rowH})`)
            for (const [phase] of PHASES) {
                const data = curves.get(violin).get(phase)
                if (band) g.append('path').attr('class', `band ${phase}`).attr('d', area(data))
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
            .text('Frequency (Hz)')

        const legend = this.svg.append('g').attr('transform', `translate(${W - M.right + 20}, ${H / 2 - 20})`)
        PHASES.forEach(([phase, label], i) => {
            legend.append('path').attr('class', `line ${phase}`).attr('d', `M0,${i * 25}h20`)
            legend.append('text').attr('x', 28).attr('y', i * 25).attr('dy', '0.35em').text(label)
        })
    }
}

customElements.define('x-recordings', Recordings)
