import * as d3 from 'd3'

const DATASETS = [['cnsm', 'CNSM'], ['villefavard_2026', 'Villefavard']]
const EXCERPTS = {
    Bach: 'Bach', Free: 'Libre', Glazounov: 'Glazounov', Glazounov2: 'Glazounov 2', Mozart: 'Mozart',
    Scale: 'Gamme', Sibelius: 'Sibelius', Sibelius2: 'Sibelius 2', Tchai: 'Tchaïkovski',
}
const GAP = 80, R = 5
const SOUND = excerpt => `sounds/${excerpt}_01.wav`
const M = { top: 10, right: 10, bottom: 30, left: 110 }

// 95% bootstrap confidence interval of the mean, like seaborn's errorbar=("ci", 95).
// Seeded, so the interval does not change between redraws.
const bootstrap = (values, n = 1000) => {
    const pick = d3.randomInt.source(d3.randomLcg(0))(values.length)
    const means = Array.from({ length: n }, () => d3.mean(values.map(() => values[pick()])))
    return [d3.quantile(means, 0.025), d3.quantile(means, 0.975)]
}

// One point per training excerpt, tested on the other excerpts, sorted by mean accuracy
const summarize = rows => d3.rollups(
    rows.filter(d => d.test_type === 'Different Excerpt'),
    v => {
        const values = v.map(d => d.accuracy)
        const [min, max] = bootstrap(values)
        return { mean: d3.mean(values), min, max }
    },
    d => d.excerpt_trained_on,
).map(([excerpt, s]) => ({ excerpt, ...s })).sort((a, b) => a.mean - b.mean)

class InfluenceExcerpt extends HTMLElement {

    constructor() {
        super()

        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host { display: block; width: 100%; height: 60vh; margin: 0 auto; }
                svg { display: block; width: 100%; height: 100%; overflow: visible; }
                text { font: 14px var(--font); fill: var(--control); }
                .grid line { stroke: lightgrey; }
                .ci { stroke: black; stroke-width: 1.5; fill: none; }
                circle { fill: black; }
                circle.playing { fill: var(--test); }
                .hit { fill: transparent; cursor: pointer; }
            </style>
            <svg></svg>
        `
        this.svg = d3.select(shadow.querySelector('svg'))
        this.data = d3.csv('data/influence-excerpt.csv', d3.autoType)
            .then(rows => d3.rollup(rows, summarize, d => d.dataset))
        this.audio = new Audio()
        this.audio.addEventListener('ended', () => this.play(null))
    }

    // The figure takes the size of the element: redraw whenever it changes
    connectedCallback() {
        this.observer = new ResizeObserver(() => this.render())
        this.observer.observe(this)
        Reveal.on('slidechanged', () => {
            if (!this.closest('section').classList.contains('present')) this.play(null)
        })
    }

    disconnectedCallback() {
        this.observer.disconnect()
    }

    async render() {
        const points = await this.data
        const W = this.clientWidth, H = this.clientHeight
        if (!W || !H) return
        this.svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove()

        const all = [...points.values()].flat()
        const rowH = (H - M.top - M.bottom) / DATASETS.length
        const y = d3.scaleLinear([d3.min(all, d => d.min), d3.max(all, d => d.max)], [rowH - GAP - R, R]).nice()

        DATASETS.forEach(([dataset, label], i) => {
            const data = points.get(dataset)
            const x = d3.scalePoint(data.map(d => d.excerpt), [M.left, W - M.right]).padding(0.5)
            const cap = x.step() / 10
            const g = this.svg.append('g').attr('transform', `translate(0, ${M.top + i * rowH})`)

            g.append('g').attr('class', 'grid')
                .selectAll('line').data(y.ticks(4)).join('line')
                .attr('x1', M.left).attr('x2', W - M.right).attr('y1', y).attr('y2', y)
            for (const d of data) {
                const cx = x(d.excerpt)
                g.append('path').attr('class', 'ci')
                    .attr('d', `M${cx - cap},${y(d.min)}h${2 * cap}M${cx},${y(d.min)}V${y(d.max)}M${cx - cap},${y(d.max)}h${2 * cap}`)
                const dot = g.append('circle').attr('cx', cx).attr('cy', y(d.mean)).attr('r', R)
                // First row: click a dot (or around it) to hear its excerpt
                if (i === 0) {
                    dot.attr('data-excerpt', d.excerpt).classed('playing', d.excerpt === this.playing)
                    g.append('circle').attr('class', 'hit')
                        .attr('cx', cx).attr('cy', y(d.mean)).attr('r', 3 * R)
                        .on('click', () => this.play(d.excerpt === this.playing ? null : d.excerpt))
                }
            }

            g.append('g')
                .attr('transform', `translate(${M.left}, 0)`)
                .call(d3.axisLeft(y).ticks(4, '.0%'))
            g.append('g')
                .attr('transform', `translate(0, ${rowH - GAP})`)
                .call(d3.axisBottom(x).tickFormat(excerpt => EXCERPTS[excerpt]))
                .selectAll('.tick text')
                .attr('text-anchor', 'end')
                .attr('transform', 'rotate(-30)')
            g.append('text')
                .attr('transform', `translate(${M.left - 65}, ${(rowH - GAP) / 2}) rotate(-90)`)
                .attr('text-anchor', 'middle')
                .text(label)
        })

        this.svg.append('text')
            .attr('transform', `translate(15, ${M.top + (H - M.top - M.bottom) / 2}) rotate(-90)`)
            .attr('text-anchor', 'middle')
            .text('Taux de bonne classification')
        this.svg.append('text')
            .attr('x', (M.left + W - M.right) / 2)
            .attr('y', H - 5)
            .attr('text-anchor', 'middle')
            .text("Extrait d'entraînement")
    }

    // Plays the recording of an excerpt, or stops with null
    play(excerpt) {
        this.playing = excerpt
        if (excerpt) {
            this.audio.src = SOUND(excerpt)
            this.audio.play()
        } else {
            this.audio.pause()
        }
        this.svg.selectAll('circle[data-excerpt]')
            .classed('playing', function () { return this.dataset.excerpt === excerpt })
    }
}

customElements.define('x-influence-excerpt', InfluenceExcerpt)
