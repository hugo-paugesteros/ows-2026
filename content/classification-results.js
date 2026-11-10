import * as d3 from 'd3'

// [dataset, title, number of violins (chance level = 1 / n)]
const DATASETS = [['bilbao', 'Bilbao', 13], ['cnsm', 'CNSM', 3], ['villefavard_2026', 'Villefavard', 7]]
const FEATURES = ['LTAS', 'LTCC', 'MFCC']
const CLASSIFIERS = [['KNeighborsClassifier', 'k-NN', 'knn'], ['SVC', 'SVM', 'svm']]
const GAP = 20
const M = { top: 30, right: 100, bottom: 50, left: 70 }

// Tukey box: quartiles, whiskers at the furthest points within 1.5 IQR, outliers beyond
const box = values => {
    values = d3.sort(values)
    const [q1, median, q3] = [0.25, 0.5, 0.75].map(p => d3.quantileSorted(values, p))
    const iqr = q3 - q1
    const inside = values.filter(v => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr)
    const low = inside[0], high = inside.at(-1)
    return { q1, median, q3, low, high, outliers: values.filter(v => v < low || v > high) }
}

class ClassificationResults extends HTMLElement {

    constructor() {
        super()

        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host { display: block; width: 100%; height: 60vh; margin: 0 auto; }
                svg { display: block; width: 100%; height: 100%; overflow: visible; }
                text { font: 1rem var(--font); fill: var(--control); }
                .grid line { stroke: lightgrey; }
                .box { stroke: #444; stroke-width: 1.5; fill: none; }
                .box rect { fill-opacity: 0.8; }
                .knn { fill: #4878d0; }
                .svm { fill: #ee854a; }
                .chance { stroke: red; stroke-width: 1.5; stroke-dasharray: 2 3; }
            </style>
            <svg></svg>
        `
        this.svg = d3.select(shadow.querySelector('svg'))
        this.data = d3.csv('data/classification-results.csv', d3.autoType)
            .then(rows => d3.rollup(rows, v => box(v.map(d => d.accuracy)), d => d.dataset, d => d.feature, d => d.classifier))
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
        const boxes = await this.data
        const W = this.clientWidth, H = this.clientHeight
        if (!W || !H) return
        this.svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove()

        const colW = (W - M.left - M.right) / DATASETS.length
        const x = d3.scaleBand(FEATURES, [0, colW - GAP]).padding(0.2)
        const dx = d3.scaleBand(CLASSIFIERS.map(([classifier]) => classifier), [0, x.bandwidth()]).padding(0.1)
        const y = d3.scaleLinear([0, 1.05], [H - M.bottom, M.top])
        const cap = dx.bandwidth() / 4

        DATASETS.forEach(([dataset, title, n], j) => {
            const g = this.svg.append('g').attr('transform', `translate(${M.left + j * colW}, 0)`)
            g.append('g').attr('class', 'grid')
                .selectAll('line').data(y.ticks(5)).join('line')
                .attr('x2', colW - GAP).attr('y1', y).attr('y2', y)

            for (const feature of FEATURES) {
                for (const [classifier, , cls] of CLASSIFIERS) {
                    const d = boxes.get(dataset).get(feature).get(classifier)
                    const left = x(feature) + dx(classifier), cx = left + dx.bandwidth() / 2
                    const b = g.append('g').attr('class', 'box')
                    b.append('path').attr('d', `M${cx},${y(d.low)}V${y(d.q1)}M${cx},${y(d.q3)}V${y(d.high)}`
                        + `M${cx - cap},${y(d.low)}h${2 * cap}M${cx - cap},${y(d.high)}h${2 * cap}`)
                    b.append('rect').attr('class', cls)
                        .attr('x', left).attr('width', dx.bandwidth())
                        .attr('y', y(d.q3)).attr('height', y(d.q1) - y(d.q3))
                    b.append('path').attr('d', `M${left},${y(d.median)}h${dx.bandwidth()}`)
                    b.selectAll('circle').data(d.outliers).join('circle')
                        .attr('cx', cx).attr('cy', y).attr('r', 3)
                }
            }

            g.append('line').attr('class', 'chance')
                .attr('x2', colW - GAP).attr('y1', y(1 / n)).attr('y2', y(1 / n))
            g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(j === 0 ? d3.format('.0%') : ''))
            g.append('g')
                .attr('transform', `translate(0, ${H - M.bottom})`)
                .call(d3.axisBottom(x))
            g.append('text')
                .attr('x', (colW - GAP) / 2)
                .attr('y', M.top - 15)
                .attr('text-anchor', 'middle')
                .text(title)
        })

        this.svg.append('text')
            .attr('transform', `translate(15, ${(M.top + H - M.bottom) / 2}) rotate(-90)`)
            .attr('text-anchor', 'middle')
            .text('Taux de bonne classification')
        this.svg.append('text')
            .attr('x', (M.left + W - M.right) / 2)
            .attr('y', H - 5)
            .attr('text-anchor', 'middle')
            .text('Descripteur acoustique')

        const legend = this.svg.append('g').attr('transform', `translate(${W - M.right + 10}, ${H / 2 - 25})`)
        CLASSIFIERS.forEach(([, label, cls], i) => {
            legend.append('rect').attr('class', `box ${cls}`).attr('y', i * 25 - 6).attr('width', 20).attr('height', 12)
            legend.append('text').attr('x', 28).attr('y', i * 25).attr('dy', '0.35em').text(label)
        })
        legend.append('line').attr('class', 'chance').attr('y1', 50).attr('x2', 20).attr('y2', 50)
        legend.append('text').attr('x', 28).attr('y', 50).attr('dy', '0.35em').text('Hasard')
    }
}

customElements.define('x-classification-results', ClassificationResults)
