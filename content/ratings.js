import * as d3 from 'd3'
import { violinIcon } from './pictogram.js'

const VIOLINS = [['Klimke', 'Test Violin'], ['Levaggi', 'Control Violin 1'], ['Stoppani', 'Control Violin 2']]
const CRITERIA = [['power', 'Power'], ['ease', 'Ease of playing'], ['tone', 'Tone']]
const PHASES = [['before', 'Before'], ['after', 'After']]
const GAP = 15, R = 5
const M = { top: 40, right: 100, bottom: 10, left: 130 }

// Mean rating and its 95% confidence interval (none for a single player)
const stats = values => {
    const mean = d3.mean(values)
    const ci = 1.96 * Math.sqrt(d3.mean(values, x => (x - mean) ** 2) / values.length)
    return { mean, min: mean - ci, max: mean + ci }
}

// { before: stats, after: stats }, skipping players who did not rate
const summarize = rows => Object.fromEntries(PHASES.map(([phase]) => [
    phase, stats(rows.map(d => d[phase]).filter(v => v !== null)),
]))

class Ratings extends HTMLElement {

    static observedAttributes = ['scope']

    constructor() {
        super()

        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host { display: block; width: 100%; height: 60vh; margin: 0 auto; }
                svg { display: block; width: 100%; height: 100%; overflow: visible; }
                text { font: 14px var(--font); fill: var(--control); }
                .grid line { stroke: lightgrey; }
                .ci { stroke-width: 1.5; }
                .before { fill: black; stroke: black; }
                .after { fill: darkgrey; stroke: darkgrey; }
                .frame { fill: none; stroke: var(--test); stroke-width: 3; stroke-opacity: 0; transition: stroke-opacity 0.4s; }
            </style>
            <svg></svg>
        `
        this.svg = d3.select(shadow.querySelector('svg'))
        this.data = d3.csv('data/ratings-before-after.csv', d3.autoType)
            .then(rows => d3.rollup(rows, summarize, d => d.scope, d => d.violin, d => d.criterion))
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

    // scope="test" (Test violinist) or scope="control" (control group)
    async render() {
        const scope = this.getAttribute('scope') ?? 'test'
        const cells = (await this.data).get(scope)
        const W = this.clientWidth, H = this.clientHeight
        if (!W || !H) return
        this.svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove()

        const points = [...cells.values()].flatMap(criteria => [...criteria.values()]).flatMap(Object.values)

        const rowH = (H - M.top - M.bottom) / VIOLINS.length
        const colW = (W - M.left - M.right) / CRITERIA.length
        const x = d3.scalePoint(PHASES.map(([phase]) => phase), [0, colW - GAP]).padding(1)
        const y = d3.scaleLinear([d3.min(points, d => d.min), d3.max(points, d => d.max)], [rowH - GAP - R, R]).nice()

        VIOLINS.forEach(([violin, label], i) => {
            CRITERIA.forEach(([criterion], j) => {
                const g = this.svg.append('g').attr('transform', `translate(${M.left + j * colW}, ${M.top + i * rowH})`)
                // Hidden frame around the cell: a slide can show it to emphasize the cell (::part(Klimke-ease))
                g.append('rect').attr('class', 'frame').attr('part', `frame ${violin}-${criterion}`)
                    .attr('x', -6).attr('y', -6).attr('rx', 6)
                    .attr('width', colW - GAP + 12).attr('height', rowH - GAP + 12)
                g.append('g').attr('class', 'grid')
                    .selectAll('line').data(y.ticks(4)).join('line')
                    .attr('x2', colW - GAP).attr('y1', y).attr('y2', y)
                for (const [phase] of PHASES) {
                    const d = cells.get(violin).get(criterion)[phase]
                    g.append('line').attr('class', `ci ${phase}`)
                        .attr('x1', x(phase)).attr('x2', x(phase))
                        .attr('y1', y(d.min)).attr('y2', y(d.max))
                    g.append('circle').attr('class', phase)
                        .attr('cx', x(phase)).attr('cy', y(d.mean)).attr('r', R)
                }
                g.append('g').call(d3.axisLeft(y).ticks(4).tickFormat(j === 0 ? d3.format('') : ''))
            })
            violinIcon(this.svg, violin, M.left - 80, M.top + i * rowH + (rowH - GAP) / 2)
            this.svg.append('text')
                .attr('transform', `translate(${M.left - 45}, ${M.top + i * rowH + (rowH - GAP) / 2}) rotate(-90)`)
                .attr('text-anchor', 'middle')
                .text(label)
        })

        CRITERIA.forEach(([, label], j) => {
            this.svg.append('text')
                .attr('x', M.left + j * colW + (colW - GAP) / 2)
                .attr('y', M.top - 15)
                .attr('text-anchor', 'middle')
                .text(label)
        })
        this.svg.append('text')
            .attr('transform', `translate(15, ${M.top + (H - M.top - M.bottom) / 2}) rotate(-90)`)
            .attr('text-anchor', 'middle')
            .text('Rating (0-10)')

        const legend = this.svg.append('g').attr('transform', `translate(${W - M.right + 20}, ${H / 2 - 20})`)
        PHASES.forEach(([phase, label], i) => {
            legend.append('circle').attr('class', phase).attr('cx', R).attr('cy', i * 25).attr('r', R)
            legend.append('text').attr('x', 18).attr('y', i * 25).attr('dy', '0.35em').text(label)
        })
    }
}

customElements.define('x-ratings', Ratings)
