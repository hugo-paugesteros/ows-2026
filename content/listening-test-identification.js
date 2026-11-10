import * as d3 from 'd3'

// One entry per test condition, in the order they are presented. The chips show
// what differs in X compared to A and B: the player, the excerpt, or only the take (′).
const CATEGORIES = [
    ['Same Excerpt\nSame Player\nSame Take', ['Même', 'enregistrement'], {}],
    ['Same Excerpt\nSame Player', ['Autre prise'], { take: true }],
    ['Same Excerpt\nDifferent Player', ['Autre musicien'], { take: true, player: true }],
    ['Different Excerpt\nSame Player', ['Autre extrait'], { excerpt: true }],
]
const LABELS = new Map(CATEGORIES)
const M = { top: 10, right: 70, bottom: 50, left: 70 }

// 95% bootstrap confidence interval of the mean, like seaborn's errorbar="ci".
// Seeded, so the interval does not change between redraws.
const bootstrap = (values, n = 1000) => {
    const pick = d3.randomInt.source(d3.randomLcg(0))(values.length)
    const means = Array.from({ length: n }, () => d3.mean(values.map(() => values[pick()])))
    return [d3.quantile(means, 0.025), d3.quantile(means, 0.975)]
}

// One bar per category: mean accuracy over the listeners and its confidence interval
const summarize = rows => {
    const values = rows.map(d => d.correct)
    const [min, max] = bootstrap(values)
    return { mean: d3.mean(values), min, max }
}

const icon = (type, cls) => `<svg class="icon ${cls}"><use href="images/icons.svg#${type}"/></svg>`

// A recording: its violin, its player and its excerpt (♪, or ♪′ for another take of it)
const chip = (letter, violin) => `
    <div class="chip ${letter.toLowerCase()}">
        <span class="letter">${letter}</span>
        <div class="symbols">
            ${violin}${icon('person', 'player')}<span class="excerpt">♪<span class="prime">′</span></span>
        </div>
    </div>
`

// Steps (1 + visible fragments):
// 1: the three recordings of the test, no results yet
// 2-5: each condition in turn, and its bar
class ListeningTestIdentification extends HTMLElement {

    constructor() {
        super()

        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host {
                    display: block; width: 100%; margin: 0 auto;
                    --violin-a: var(--k0); --violin-b: var(--k1);
                    --same: #999; --changed: var(--k2);
                }

                .chips { display: flex; justify-content: center; align-items: flex-end; gap: 1.2em; height: 18vh; }
                .chip { display: flex; flex-direction: column; align-items: center; gap: 0.2em; }
                .chip.x { margin-left: 2em; }
                .letter { font: 600 0.9em var(--font); color: var(--control); }
                .symbols {
                    display: flex; align-items: center; gap: 0.4em;
                    padding: 0.3em 0.7em; border: 2px solid lightgrey; border-radius: 8px;
                }
                .icon { display: block; width: 2em; height: 2em; color: var(--same); transition: color 0.5s; }
                .excerpt { font-size: 1.8em; line-height: 1; color: var(--same); transition: color 0.5s; }
                .prime { opacity: 0; transition: opacity 0.5s; }
                .a .violin { color: var(--violin-a); }
                .b .violin { color: var(--violin-b); }

                /* X is played on violin A or B: both colors, blended across the body */
                .mix { position: relative; width: 2em; height: 2em; }
                .mix .icon { position: absolute; inset: 0; }
                .mix .violin-a { color: var(--violin-a); }
                .mix .violin-b { color: var(--violin-b); mask-image: linear-gradient(135deg, transparent 35%, black 65%); }

                .x.changed-player .player, .x.changed-excerpt .excerpt { color: var(--changed); }
                .x.changed-take .prime { opacity: 1; }

                .chart { height: 42vh; margin-top: 4vh; }
                svg.plot { display: block; width: 100%; height: 100%; overflow: visible; }
                text { font: 14px var(--font); fill: var(--control); }
                .grid line { stroke: lightgrey; }
                .bar { fill: darkgrey; }
                .ci { stroke: black; stroke-width: 1.5; fill: none; }
                .chance { stroke: red; stroke-width: 1.5; stroke-dasharray: 6 4; }
                .level { opacity: 0; transition: opacity 0.5s; }
                .level.shown { opacity: 1; }
            </style>
            <div class="chips">
                ${chip('A', icon('violin', 'violin'))}
                ${chip('B', icon('violin', 'violin'))}
                ${chip('X', `<div class="mix">${icon('violin', 'violin-a')}${icon('violin', 'violin-b')}</div>`)}
            </div>
            <div class="chart"><svg class="plot"></svg></div>
        `
        this.x = shadow.querySelector('.chip.x')
        this.chart = shadow.querySelector('.chart')
        this.svg = d3.select(shadow.querySelector('svg.plot'))
        this.data = d3.csv('data/listening-test-identification.csv', d3.autoType)
            .then(rows => d3.rollup(rows, summarize, d => d.category))
        this.step = 1
    }

    // The figure takes the size of the element: redraw whenever it changes
    connectedCallback() {
        this.observer = new ResizeObserver(() => this.render())
        this.observer.observe(this.chart)

        const update = () => this.setStep(1 + this.closest('section').querySelectorAll('.fragment.visible').length)
        update()
        for (const event of ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden']) {
            Reveal.on(event, update)
        }
    }

    disconnectedCallback() {
        this.observer.disconnect()
    }

    setStep(step) {
        this.step = step
        const [, , changes] = CATEGORIES[Math.max(0, step - 2)]
        for (const change of ['take', 'player', 'excerpt']) {
            this.x.classList.toggle(`changed-${change}`, !!changes[change])
        }
        this.svg.selectAll('.level').classed('shown', i => i < step - 1)
    }

    async render() {
        const bars = await this.data
        const W = this.chart.clientWidth, H = this.chart.clientHeight
        if (!W || !H) return
        this.svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove()

        const x = d3.scaleBand(CATEGORIES.map(([category]) => category), [M.left, W - M.right]).padding(0.3)
        const y = d3.scaleLinear([0, 1], [H - M.bottom, M.top])
        const cap = x.bandwidth() / 10

        this.svg.append('g').attr('class', 'grid')
            .selectAll('line').data(y.ticks(5)).join('line')
            .attr('x1', M.left).attr('x2', W - M.right).attr('y1', y).attr('y2', y)

        // One group per condition (bar, interval and label), revealed step by step
        CATEGORIES.forEach(([category], i) => {
            const d = bars.get(category)
            const cx = x(category) + x.bandwidth() / 2
            const g = this.svg.append('g').datum(i).attr('class', 'level')
            g.append('rect').attr('class', 'bar')
                .attr('x', x(category)).attr('width', x.bandwidth())
                .attr('y', y(d.mean)).attr('height', y(0) - y(d.mean))
            g.append('path').attr('class', 'ci')
                .attr('d', `M${cx - cap},${y(d.min)}h${2 * cap}M${cx},${y(d.min)}V${y(d.max)}M${cx - cap},${y(d.max)}h${2 * cap}`)
            g.append('text')
                .attr('x', cx).attr('y', H - M.bottom + 22).attr('text-anchor', 'middle')
                .selectAll('tspan').data(LABELS.get(category)).join('tspan')
                .attr('x', cx).attr('dy', (_, j) => j ? '1.2em' : null)
                .text(line => line)
        })

        this.svg.append('line').attr('class', 'chance')
            .attr('x1', M.left).attr('x2', W - M.right).attr('y1', y(0.5)).attr('y2', y(0.5))
        this.svg.append('text')
            .attr('x', W - M.right + 8).attr('y', y(0.5)).attr('dy', '0.35em')
            .text('Hasard')

        this.svg.append('g')
            .attr('transform', `translate(${M.left}, 0)`)
            .call(d3.axisLeft(y).ticks(5, '.0%'))
        this.svg.append('g')
            .attr('transform', `translate(0, ${H - M.bottom})`)
            .call(d3.axisBottom(x).tickFormat('').tickSize(0))

        this.svg.append('text')
            .attr('transform', `translate(15, ${(M.top + H - M.bottom) / 2}) rotate(-90)`)
            .attr('text-anchor', 'middle')
            .text('Réponses correctes')

        this.setStep(this.step)
    }
}

customElements.define('listening-test-identification', ListeningTestIdentification)
