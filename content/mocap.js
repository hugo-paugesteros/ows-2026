import * as d3 from 'd3'
import { violinIcon } from './pictogram.js'

const VIOLINS = [['Klimke', 'Violon Test'], ['Own', 'Violon personnel']]
const EXCERPTS = [['Open_string', 'Cordes à vide'], ['Bach', 'Bach'], ['Tchai', 'Tchaïkovski'], ['Glazounov', 'Glazounov']]
const PHASES = [['before', 'Avant'], ['after', 'Après']]
const DESCRIPTORS = { xs: 'xs (mm)', vs: 'vs (mm/s)', beta: 'beta (mm)', hairstring: 'hairstring (mm)' }
const GAP = 15
const M = { top: 30, right: 100, bottom: 50, left: 150 }

// Mean over the takes and its 95% confidence interval, skipping missing values
const stats = values => {
    values = values.filter(v => v !== null)
    const mean = d3.mean(values)
    const ci = 1.96 * Math.sqrt(d3.mean(values, x => (x - mean) ** 2) / values.length)
    return { mean, min: mean - ci, max: mean + ci }
}

// One point per time: stats of every descriptor
const summarize = rows => d3.rollups(rows, v => Object.fromEntries(
    Object.keys(DESCRIPTORS).map(descriptor => [descriptor, stats(v.map(d => d[descriptor]))])
), d => d.time)
    .map(([time, s]) => ({ time, ...s }))
    .sort((a, b) => a.time - b.time)

class Mocap extends HTMLElement {

    static observedAttributes = ['descriptor']

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
        this.data = d3.csv('data/mocap-descriptors.csv', d3.autoType)
            .then(rows => d3.rollup(rows, summarize, d => d.excerpt, d => d.violin, d => d.phase))
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

    // descriptor="xs", "vs", "beta" or "hairstring"
    async render() {
        const descriptor = this.getAttribute('descriptor') ?? 'vs'
        const curves = await this.data
        const W = this.clientWidth, H = this.clientHeight
        if (!W || !H) return
        this.svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove()

        const points = [...curves.values()].flatMap(violins => [...violins.values()])
            .flatMap(phases => [...phases.values()].flat())
            .map(d => d[descriptor])

        const rowH = (H - M.top - M.bottom) / VIOLINS.length
        const colW = (W - M.left - M.right) / EXCERPTS.length
        const y = d3.scaleLinear([d3.min(points, d => d.min), d3.max(points, d => d.max)], [rowH - GAP, 0]).nice()

        EXCERPTS.forEach(([excerpt, title], j) => {
            const times = [...curves.get(excerpt).values()].flatMap(phases => [...phases.values()].flat())
            const x = d3.scaleLinear(d3.extent(times, d => d.time), [0, colW - GAP])
            const area = d3.area().defined(d => d[descriptor].mean !== undefined)
                .x(d => x(d.time)).y0(d => y(d[descriptor].min)).y1(d => y(d[descriptor].max))
            const line = d3.line().defined(d => d[descriptor].mean !== undefined)
                .x(d => x(d.time)).y(d => y(d[descriptor].mean))

            VIOLINS.forEach(([violin], i) => {
                const g = this.svg.append('g').attr('transform', `translate(${M.left + j * colW}, ${M.top + i * rowH})`)
                for (const [phase] of PHASES) {
                    const data = curves.get(excerpt).get(violin).get(phase)
                    g.append('path').attr('class', `band ${phase}`).attr('d', area(data))
                    g.append('path').attr('class', `line ${phase}`).attr('d', line(data))
                }
                g.append('g').call(d3.axisLeft(y).ticks(4).tickFormat(j === 0 ? null : ''))
                g.append('g')
                    .attr('transform', `translate(0, ${rowH - GAP})`)
                    .call(d3.axisBottom(x).ticks(3).tickFormat(i === VIOLINS.length - 1 ? null : ''))
            })

            this.svg.append('text')
                .attr('x', M.left + j * colW + (colW - GAP) / 2)
                .attr('y', M.top - 15)
                .attr('text-anchor', 'middle')
                .text(title)
        })

        VIOLINS.forEach(([violin, label], i) => {
            violinIcon(this.svg, violin, M.left - 100, M.top + i * rowH + (rowH - GAP) / 2)
            this.svg.append('text')
                .attr('transform', `translate(${M.left - 65}, ${M.top + i * rowH + (rowH - GAP) / 2}) rotate(-90)`)
                .attr('text-anchor', 'middle')
                .text(label)
        })
        this.svg.append('text')
            .attr('transform', `translate(15, ${M.top + (H - M.top - M.bottom) / 2}) rotate(-90)`)
            .attr('text-anchor', 'middle')
            .text(DESCRIPTORS[descriptor])
        this.svg.append('text')
            .attr('x', (M.left + W - M.right) / 2)
            .attr('y', H - 5)
            .attr('text-anchor', 'middle')
            .text('Temps (s)')

        const legend = this.svg.append('g').attr('transform', `translate(${W - M.right + 20}, ${H / 2 - 20})`)
        PHASES.forEach(([phase, label], i) => {
            legend.append('path').attr('class', `line ${phase}`).attr('d', `M0,${i * 25}h20`)
            legend.append('text').attr('x', 28).attr('y', i * 25).attr('dy', '0.35em').text(label)
        })
    }
}

customElements.define('x-mocap', Mocap)
