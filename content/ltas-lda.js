import * as d3 from 'd3'

// The LTAS of each recording, projected on the 2D LDA learnt before the playing-in period
// (sessions 1-2), see ltas_pca.py. A colour per violin, a marker per phase.
// Steps (1 + visible fragments): 1 the recordings before; 2 and after; 3 each violin x phase
// gathered at its mean, with the 95% confidence ellipse of that mean.
const VIOLINS = [
    ['Klimke', 'Violon Test', 'var(--test)'],
    ['Levaggi', 'Violon Témoin 1', 'var(--control)'],
    ['Stoppani', 'Violon Témoin 2', '#999'],
]
const PHASES = [['before', 'Avant', d3.symbolCircle], ['after', 'Après', d3.symbolX]]
const TEST_PLAYER = 'Player 0'
const K = Math.sqrt(-2 * Math.log(0.05)) // 95% quantile of the chi² distribution with 2 dof, as a radius
const M = { top: 10, right: 170, bottom: 40, left: 50 }

// Filled dot before, cross (stroke only) after
const paint = (selection, phase, colour) => selection.attr('class', phase).style(phase === 'before' ? 'fill' : 'stroke', colour)

class LtasLda extends HTMLElement {

    static observedAttributes = ['scope']

    constructor() {
        super()

        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host { display: block; width: 100%; height: 60vh; margin: 0 auto; }
                svg { display: block; width: 100%; height: 100%; overflow: visible; }
                text { font: 14px var(--font); fill: var(--control); }
                .before { stroke: none; fill-opacity: 0.6; }
                .after { fill: none; stroke-width: 1.5; }
                .ellipse { fill: none; stroke-width: 1.5; }
                .ellipse.dashed { stroke-dasharray: 4 3; }
            </style>
            <svg></svg>
        `
        this.svg = d3.select(shadow.querySelector('svg'))
        this.data = d3.csv('data/ltas-lda.csv', d3.autoType)
    }

    // The figure takes the size of the element: redraw whenever it changes
    connectedCallback() {
        this.observer = new ResizeObserver(() => this.render())
        this.observer.observe(this)
        const update = animate => {
            if (this.step !== this.shown) this.show(animate)
        }
        for (const event of ['ready', 'slidechanged']) Reveal.on(event, () => update(false))
        for (const event of ['fragmentshown', 'fragmenthidden']) Reveal.on(event, () => update(true))
    }

    get step() {
        return 1 + this.closest('section').querySelectorAll('.fragment.visible').length
    }

    disconnectedCallback() {
        this.observer.disconnect()
    }

    attributeChangedCallback() {
        this.render()
    }

    // scope="control" (without the Test violinist), scope="test" (the Test violinist only), or all
    async render() {
        const scope = this.getAttribute('scope')
        const rows = (await this.data)
            .filter(d => !scope || (scope === 'test') === (d.player_id === TEST_PLAYER))
        const W = this.clientWidth, H = this.clientHeight
        if (!W || !H) return
        this.svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove()

        const x = d3.scaleLinear(d3.extent(rows, d => d.ld1), [M.left, W - M.right]).nice()
        const y = d3.scaleLinear(d3.extent(rows, d => d.ld2), [H - M.bottom, M.top]).nice()
        const colour = new Map(VIOLINS.map(([violin, , c]) => [violin, c]))
        const means = d3.rollup(rows, v => [d3.mean(v, d => d.ld1), d3.mean(v, d => d.ld2)], d => d.violin, d => d.phase)
        this.position = (d, gathered) => {
            const [ld1, ld2] = gathered ? means.get(d.violin).get(d.phase) : [d.ld1, d.ld2]
            return `translate(${x(ld1)}, ${y(ld2)})`
        }

        // Before first, so the recordings made after are drawn on top
        this.points = PHASES.map(([phase, , symbol]) => [
            this.svg.append('g').selectAll('path').data(rows.filter(d => d.phase === phase)).join('path')
                .call(paint, phase, d => colour.get(d.violin)),
            phase, symbol,
        ])

        // 95% confidence ellipse of each mean, recordings taken as independent: the covariance of the mean
        // (covariance / n), through its Cholesky factor [[a, 0], [b, c]], maps the unit circle onto the
        // ellipse. Solid before, dashed after.
        this.ellipses = this.svg.append('g')
        for (const [violin, phases] of d3.group(rows, d => d.violin, d => d.phase)) {
            for (const [phase, v] of phases) {
                const [m1, m2] = means.get(violin).get(phase), n = v.length
                const c11 = d3.variance(v, d => d.ld1) / n, c22 = d3.variance(v, d => d.ld2) / n
                const c12 = d3.sum(v, d => (d.ld1 - m1) * (d.ld2 - m2)) / (n - 1) / n
                const a = Math.sqrt(c11), b = c12 / a, c = Math.sqrt(c22 - b * b)
                const outline = d3.range(61).map(i => {
                    const t = 2 * Math.PI * i / 60
                    return [x(m1 + K * a * Math.cos(t)), y(m2 + K * (b * Math.cos(t) + c * Math.sin(t)))]
                })
                this.ellipses.append('path').attr('d', d3.line()(outline))
                    .attr('class', phase === 'after' ? 'ellipse dashed' : 'ellipse')
                    .style('stroke', colour.get(violin))
            }
        }

        this.svg.append('g').attr('transform', `translate(0, ${H - M.bottom})`).call(d3.axisBottom(x).ticks(5))
        this.svg.append('g').attr('transform', `translate(${M.left}, 0)`).call(d3.axisLeft(y).ticks(5))
        this.svg.append('text')
            .attr('x', (M.left + W - M.right) / 2).attr('y', H - 5)
            .attr('text-anchor', 'middle').text('LD 1')
        this.svg.append('text')
            .attr('transform', `translate(15, ${(M.top + H - M.bottom) / 2}) rotate(-90)`)
            .attr('text-anchor', 'middle').text('LD 2')

        // Legend: the colours (violins), then the markers (phases)
        const legend = this.svg.append('g').attr('transform', `translate(${W - M.right + 25}, ${H / 2 - 60})`)
        const entries = [
            ...VIOLINS.map(([, label, c]) => [label, 'before', d3.symbolCircle, c]),
            ...PHASES.map(([phase, label, symbol]) => [label, phase, symbol, 'var(--control)']),
        ]
        entries.forEach(([label, phase, symbol, c], i) => {
            const top = (i + (i >= VIOLINS.length ? 0.6 : 0)) * 25
            legend.append('path')
                .attr('d', d3.symbol(symbol, 70)).attr('transform', `translate(0, ${top})`)
                .call(paint, phase, c)
            legend.append('text').attr('x', 14).attr('y', top).attr('dy', '0.35em').text(label)
        })

        this.show(false)
    }

    show(animate) {
        if (!this.points) return
        const step = this.shown = this.step
        const apply = selection => animate ? selection.transition().duration(1000) : selection
        for (const [points, phase, symbol] of this.points) {
            apply(points)
                .attr('transform', d => this.position(d, step >= 3))
                .attr('d', d3.symbol(symbol, step >= 3 ? 150 : 30))
                .style('stroke-width', step >= 3 ? 3 : 1.5)
                .style('opacity', phase === 'after' && step < 2 ? 0 : 1)
        }
        apply(this.ellipses).style('opacity', step >= 3 ? 1 : 0)
    }
}

customElements.define('x-ltas-lda', LtasLda)
