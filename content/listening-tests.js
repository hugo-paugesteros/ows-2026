import * as d3 from 'd3'
import { violinIcon } from './pictogram.js'

const VIOLINS = [['Klimke', 'Violon Test'], ['Levaggi', 'Violon Témoin 1'], ['Stoppani', 'Violon Témoin 2']]
const PAIRS = [['before_before', 'Avant / Avant'], ['before_after', 'Avant / Après']]
const GAP = 15, R = 5
const M = { top: 10, right: 130, bottom: 10, left: 130 }

// Mean dissimilarity over the listeners and its 95% confidence interval
const stats = values => {
    const mean = d3.mean(values)
    const ci = 1.96 * Math.sqrt(d3.mean(values, x => (x - mean) ** 2) / values.length)
    return { mean, min: mean - ci, max: mean + ci }
}

// { before_before: stats, before_after: stats }
const summarize = rows => Object.fromEntries(PAIRS.map(([pair]) => [pair, stats(rows.map(d => d[pair]))]))

const icon = (type, cls) => `<svg class="icon ${cls}"><use href="images/icons.svg#${type}"/></svg>`

// A recording: one violin, played by the violinist of the slide, in one session
const chip = () => `
    <div class="chip">
        <div class="symbols">${icon('violin', 'violin')}${icon('person', 'player')}</div>
        <span class="session"></span>
    </div>
`

// With the explain attribute, a pair of recordings sits above the figure and
// the steps (1 + visible fragments) walk through the task:
// 1: the pair, rated on a dissimilarity scale, no results yet
// 2: two recordings from before the playing-in period, and their ratings
// 3: one recording from before and one from after, and their ratings
const SESSIONS = [['', ''], ['Avant', 'Avant'], ['Avant', 'Après']]

class ListeningTests extends HTMLElement {

    static observedAttributes = ['scope']

    constructor() {
        super()

        const explain = this.hasAttribute('explain')
        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host { display: block; width: 100%; margin: 0 auto; }
                /* The pair of recordings on the left half, the results on the right half */
                :host([explain]) { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 1em; }
                .chart { height: 60vh; }
                svg.plot { display: block; width: 100%; height: 100%; overflow: visible; }
                text { font: 14px var(--font); fill: var(--control); stroke: none; }
                .grid line { stroke: lightgrey; }
                .ci { stroke-width: 1.5; }
                .before_before { fill: black; stroke: black; }
                .before_after { fill: darkgrey; stroke: darkgrey; }
                .phase { transition: opacity 0.5s; }
                .phase.hidden { opacity: 0; }

                .pair { display: flex; flex-direction: column; align-items: center; gap: 1.2em; }
                .chip { display: flex; flex-direction: column; align-items: center; gap: 0.3em; }
                .symbols {
                    display: flex; align-items: center; gap: 0.4em;
                    padding: 0.3em 0.7em; border: 2px solid lightgrey; border-radius: 8px;
                }
                .icon { display: block; width: 2em; height: 2em; }
                .violin { color: #999; }
                .player { color: var(--control); }
                :host([scope="test"]) .player { color: var(--test); }
                .session { font: 600 0.8em var(--font); color: var(--control); min-height: 1.3em; }

                /* Vertical scale between the two recordings: 0 at the bottom, 10 at the top */
                .scale { display: flex; align-items: center; gap: 0.3em; }
                .scale .label { font: 0.6em var(--font); color: var(--control); writing-mode: vertical-rl; rotate: 180deg; }
                .scale .axis {
                    display: flex; flex-direction: column-reverse; align-items: center; gap: 0.3em;
                    font: 0.6em var(--font); color: var(--control);
                }
                .scale .line { width: 2px; height: 5em; background: var(--control); position: relative; }
                .scale .line::before, .scale .line::after {
                    content: ''; position: absolute; left: -4px; width: 10px; height: 2px; background: var(--control);
                }
                .scale .line::before { top: 0; }
                .scale .line::after { bottom: 0; }
            </style>
            ${explain ? `
                <div class="pair">
                    ${chip()}
                    <div class="scale">
                        <span class="label">Dissimilarité</span>
                        <div class="axis"><span>0</span><div class="line"></div><span>10</span></div>
                    </div>
                    ${chip()}
                </div>
            ` : ''}
            <div class="chart"><svg class="plot"></svg></div>
        `
        this.sessions = [...shadow.querySelectorAll('.session')]
        this.chart = shadow.querySelector('.chart')
        this.svg = d3.select(shadow.querySelector('svg.plot'))
        this.data = d3.csv('data/listening-tests-panel.csv', d3.autoType)
            .then(rows => d3.rollup(rows, summarize, d => d.violinist, d => d.violin))
        // Without the explain attribute, everything is shown at once
        this.step = explain ? 1 : PAIRS.length + 1
    }

    // The figure takes the size of the element: redraw whenever it changes
    connectedCallback() {
        this.observer = new ResizeObserver(() => this.render())
        this.observer.observe(this.chart)

        if (!this.hasAttribute('explain')) return
        const update = () => this.setStep(1 + this.closest('section').querySelectorAll('.fragment.visible').length)
        update()
        for (const event of ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden']) {
            Reveal.on(event, update)
        }
    }

    disconnectedCallback() {
        this.observer.disconnect()
    }

    attributeChangedCallback() {
        this.render()
    }

    setStep(step) {
        this.step = step
        const sessions = SESSIONS[Math.min(step, SESSIONS.length) - 1]
        this.sessions.forEach((node, i) => node.textContent = sessions[i])
        PAIRS.forEach(([pair], i) => this.svg.selectAll(`.phase.${pair}`).classed('hidden', step < i + 2))
    }

    // scope="control" (recordings of the Control violinist) or scope="test" (Test violinist)
    async render() {
        const scope = this.getAttribute('scope') ?? 'control'
        const cells = (await this.data).get(scope)
        const W = this.chart.clientWidth, H = this.chart.clientHeight
        if (!W || !H) return
        this.svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove()

        const points = [...cells.values()].flatMap(Object.values)

        const rowH = (H - M.top - M.bottom) / VIOLINS.length
        const x = d3.scalePoint(PAIRS.map(([pair]) => pair), [M.left, W - M.right]).padding(1)
        const y = d3.scaleLinear([d3.min(points, d => d.min), d3.max(points, d => d.max)], [rowH - GAP - R, R]).nice()

        VIOLINS.forEach(([violin, label], i) => {
            const g = this.svg.append('g').attr('transform', `translate(0, ${M.top + i * rowH})`)
            g.append('g').attr('class', 'grid')
                .selectAll('line').data(y.ticks(4)).join('line')
                .attr('x1', M.left).attr('x2', W - M.right).attr('y1', y).attr('y2', y)
            for (const [pair] of PAIRS) {
                const d = cells.get(violin)[pair]
                const phase = g.append('g').attr('class', `phase ${pair}`)
                phase.append('line').attr('class', `ci ${pair}`)
                    .attr('x1', x(pair)).attr('x2', x(pair))
                    .attr('y1', y(d.min)).attr('y2', y(d.max))
                phase.append('circle').attr('class', pair)
                    .attr('cx', x(pair)).attr('cy', y(d.mean)).attr('r', R)
            }
            g.append('g')
                .attr('transform', `translate(${M.left}, 0)`)
                .call(d3.axisLeft(y).ticks(4))
            violinIcon(g, violin, M.left - 80, (rowH - GAP) / 2)
            g.append('text')
                .attr('transform', `translate(${M.left - 45}, ${(rowH - GAP) / 2}) rotate(-90)`)
                .attr('text-anchor', 'middle')
                .text(label)
        })

        this.svg.append('text')
            .attr('transform', `translate(15, ${M.top + (H - M.top - M.bottom) / 2}) rotate(-90)`)
            .attr('text-anchor', 'middle')
            .text('Dissimilarité')

        const legend = this.svg.append('g').attr('transform', `translate(${W - M.right + 20}, ${H / 2 - 20})`)
        PAIRS.forEach(([pair, label], i) => {
            const entry = legend.append('g').attr('class', `phase ${pair}`)
            entry.append('circle').attr('class', pair).attr('cx', R).attr('cy', i * 25).attr('r', R)
            entry.append('text').attr('x', 18).attr('y', i * 25).attr('dy', '0.35em').text(label)
        })

        this.setStep(this.step)
    }
}

customElements.define('x-listening-tests', ListeningTests)
