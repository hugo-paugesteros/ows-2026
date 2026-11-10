import * as d3 from 'd3'
import { violinIcon } from './pictogram.js'

const VIOLINS = [['Klimke', 'Test Violin'], ['Levaggi', 'Control Violin 1'], ['Stoppani', 'Control Violin 2']]
const PAIRS = [['before_before', 'Before / Before'], ['before_after', 'Before / After']]
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

// A recording: one violin, played by the violinist of the slide, in one session. The speaker on its
// corner marks it as a sound played to the listeners
const chip = () => `
    <div class="chip">
        <div class="symbols">${icon('violin', 'violin')}${icon('person', 'player')}${icon('speaker', 'speaker')}</div>
        <span class="session"></span>
    </div>
`

// With the explain attribute, a pair of recordings sits above the figure and
// the steps (1 + visible fragments) walk through the task:
// 1: the pair, rated on a dissimilarity scale, no results yet
// 2: two recordings from before the playing-in period, and their ratings
// 3: one recording from before and one from after, and their ratings
const SESSIONS = [['', ''], ['Before', 'Before'], ['Before', 'After']]

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
                :host([explain]) { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 1em; }
                .chart { height: 60vh; }
                svg.plot { display: block; width: 100%; height: 100%; overflow: visible; }
                text { font: 14px var(--font); fill: var(--control); stroke: none; }
                .grid line { stroke: lightgrey; }
                .ci { stroke-width: 1.5; }
                .before_before { fill: black; stroke: black; }
                .before_after { fill: darkgrey; stroke: darkgrey; }
                .phase { transition: opacity 0.5s; }
                .phase.hidden { opacity: 0; }

                /* A |-------| B: the two recordings with the scale between them */
                .pair { display: flex; align-items: center; justify-content: center; gap: 0.5em; }
                /* The session sits under the recording without adding to its height, so that the
                   scale lines up with the recordings themselves */
                .chip { position: relative; }
                .symbols {
                    position: relative;
                    display: flex; align-items: center; gap: 0.4em;
                    padding: 0.3em 0.5em; border: 2px solid lightgrey; border-radius: 8px;
                }
                .icon { display: block; width: 1.4em; height: 1.4em; }
                .violin { color: #999; }
                .player { color: var(--control); }
                :host([scope="test"]) .player { color: var(--test); }
                /* Badge on the top-right corner, over the border: the white disc hides the border under it */
                .symbols .speaker {
                    position: absolute; top: -0.45em; right: -0.45em;
                    width: 0.8em; height: 0.8em; padding: 0.1em;
                    border-radius: 50%; background: white; color: var(--control);
                }
                .session {
                    position: absolute; top: calc(100% + 0.3em); left: 50%; translate: -50% 0;
                    font: 600 0.8em var(--font); color: var(--control); white-space: nowrap;
                }

                /* Horizontal scale between the two recordings: 0 on the left, 10 on the right,
                   its name above without adding to its height either */
                .scale { position: relative; }
                .scale .label {
                    position: absolute; bottom: calc(100% + 0.3em); left: 50%; translate: -50% 0;
                    font: 0.6em var(--font); color: var(--control);
                }
                .scale .axis {
                    display: flex; align-items: center; gap: 0.4em;
                    font: 0.6em var(--font); color: var(--control);
                }
                .scale .line { width: 4em; height: 2px; background: var(--control); position: relative; }
                .scale .line::before, .scale .line::after {
                    content: ''; position: absolute; top: -4px; width: 2px; height: 10px; background: var(--control);
                }
                .scale .line::before { left: 0; }
                .scale .line::after { right: 0; }
            </style>
            ${explain ? `
                <div class="pair">
                    ${chip()}
                    <div class="scale">
                        <span class="label">Dissimilarity</span>
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
            .text('Dissimilarity')

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
