import * as d3 from 'd3'

// method: [data file, axis label]
const METHODS = {
    'pca': ['data/embedding-pca.csv', 'PC'],
    'lda': ['data/embedding-lda.csv', 'LD'],
    'source-filter': ['data/embedding-source-filter.csv', 'PC'],
}
const DATASETS = [['cnsm', 'CNSM'], ['villefavard_2026', 'Villefavard']]
const FACTORS = [['violin', 'Violon'], ['player', 'Musicien'], ['excerpt', 'Extrait']]
const GAP = 30, R = 2.5
const M = { top: 30, right: 10, bottom: 30, left: 90 }

// tab10 up to 10 categories, evenly spaced hues beyond (as in the thesis figures)
const palette = n => n <= 10
    ? d3.schemeCategory10.slice(0, n)
    : d3.range(n).map(i => d3.hcl(i * 360 / n, 50, 65).formatHex())

// Each file is loaded once, shared by every element using it
const files = new Map()
const load = method => {
    const [file] = METHODS[method]
    if (!files.has(file)) files.set(file, d3.csv(file, d3.autoType))
    return files.get(file)
}

class Embedding extends HTMLElement {

    static observedAttributes = ['method', 'split']

    constructor() {
        super()

        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host { display: block; width: 100%; height: 60vh; margin: 0 auto; }
                svg { display: block; width: 100%; height: 100%; overflow: visible; }
                text { font: 14px var(--font); fill: var(--control); }
                circle { fill-opacity: 0.8; stroke: white; stroke-width: 0.5; }
            </style>
            <svg></svg>
        `
        this.svg = d3.select(shadow.querySelector('svg'))
    }

    // The figure takes the size of the element: redraw whenever it changes
    connectedCallback() {
        this.observer = new ResizeObserver(() => this.render())
        this.observer.observe(this)
        const update = animate => {
            if (this.split !== this.shown) this.show(animate)
        }
        Reveal.on('slidechanged', () => update(false))
        for (const event of ['fragmentshown', 'fragmenthidden']) Reveal.on(event, () => update(true))
    }

    // With a fragment on the slide: one uncoloured column first, then the three coloured ones
    get split() {
        const section = this.closest('section')
        return !section.querySelector('.fragment') || !!section.querySelector('.fragment.visible')
    }

    disconnectedCallback() {
        this.observer.disconnect()
    }

    attributeChangedCallback() {
        this.render()
    }

    // method="pca", "lda" or "source-filter"; split="train" or "test" (LDA only, all points by default)
    async render() {
        const method = this.getAttribute('method') ?? 'pca'
        const split = this.getAttribute('split')
        const rows = await load(method)
        const W = this.clientWidth, H = this.clientHeight
        if (!W || !H) return
        this.svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove()

        const [, axis] = METHODS[method]
        const rowH = (H - M.top - M.bottom) / DATASETS.length
        this.colW = (W - M.left - M.right) / FACTORS.length
        this.columns = []

        DATASETS.forEach(([dataset, label], i) => {
            const all = rows.filter(d => d.dataset === dataset)
            const points = split ? all.filter(d => d.split_name === split) : all
            const x = d3.scaleLinear(d3.extent(points, d => d.dim_1), [R, this.colW - GAP - R]).nice()
            const y = d3.scaleLinear(d3.extent(points, d => d.dim_2), [rowH - GAP - R, R]).nice()

            FACTORS.forEach(([factor], j) => {
                // Colours from every point of the dataset, so they do not change with the split
                const values = [...new Set(all.map(d => d[factor]))]
                const color = d3.scaleOrdinal(values, palette(values.length))

                const g = this.svg.append('g')
                g.selectAll('circle').data(points).join('circle')
                    .attr('cx', d => x(d.dim_1)).attr('cy', d => y(d.dim_2)).attr('r', R)
                this.columns.push({ g, j, top: M.top + i * rowH, fill: d => color(d[factor]) })
                g.append('g').call(d3.axisLeft(y).ticks(3))
                g.append('g')
                    .attr('transform', `translate(0, ${rowH - GAP})`)
                    .call(d3.axisBottom(x).ticks(3))
            })

            this.svg.append('text')
                .attr('transform', `translate(${M.left - 50}, ${M.top + i * rowH + (rowH - GAP) / 2}) rotate(-90)`)
                .attr('text-anchor', 'middle')
                .text(label)
        })

        this.titles = this.svg.append('g')
        FACTORS.forEach(([, title], j) => {
            this.titles.append('text')
                .attr('x', M.left + j * this.colW + (this.colW - GAP) / 2)
                .attr('y', M.top - 15)
                .attr('text-anchor', 'middle')
                .text(title)
        })
        this.svg.append('text')
            .attr('transform', `translate(15, ${M.top + (H - M.top - M.bottom) / 2}) rotate(-90)`)
            .attr('text-anchor', 'middle')
            .text(`${axis} 2`)
        this.svg.append('text')
            .attr('x', (M.left + W - M.right) / 2)
            .attr('y', H - 5)
            .attr('text-anchor', 'middle')
            .text(`${axis} 1`)

        this.show(false)
    }

    show(animate) {
        if (!this.columns) return
        this.shown = this.split
        const apply = selection => animate ? selection.transition().duration(800) : selection
        this.columns.forEach(({ g, j, top, fill }) => {
            apply(g).attr('transform', `translate(${M.left + (this.shown ? j : 1) * this.colW}, ${top})`)
            apply(g.selectAll('circle')).attr('fill', this.shown ? fill : '#888')
        })
        apply(this.titles).attr('opacity', this.shown ? 1 : 0)
    }
}

customElements.define('x-embedding', Embedding)
