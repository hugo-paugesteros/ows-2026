class KNN extends HTMLElement {

    K = 3

    CLASSES = [
        [[-5, 1.5], [-2, 1.5]],
        [[5, 1.5], [2, 1.5]]
    ]
    points = []

    constructor() {
        super()

        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                }
                svg {
                    width: 100%;
                    fill: var(--control);
                    transition: .5s;
                    cursor: crosshair;
                }
                svg path {
                    stroke: var(--control);
                }
                svg rect[data-k="0"] {
                    fill: var(--k0);
                }
                svg rect[data-k="1"] {
                    fill: var(--k1);
                }
                .axes line {
                    stroke: var(--control);
                    stroke-width: 0.03;
                }
                .axes text {
                    font-size: 0.35px;
                    fill: #777;
                }
            </style>
            <svg>
                <g class="axes">
                    <line x1="-10" y1="0" x2="10" y2="0"/>
                    <line x1="0" y1="-5" x2="0" y2="5"/>
                    <text x="9.8" y="-0.3" text-anchor="end">fort dans le grave</text>
                    <text x="-9.8" y="-0.3">faible dans le grave</text>
                    <text x="0.3" y="-4.6">fort dans l'aigu</text>
                    <text x="0.3" y="4.8">faible dans l'aigu</text>
                </g>
            </svg>
        `

        this.svg = SVG(shadow.querySelector('svg'))
        this.paths = this.svg.group()
        this.svg.viewbox(-10, -5, 20, 10)
        this.createPoints()
        this.render()

        this.svg.on('click', (e) => this.handleClick(e))
    }

    createPoints() {
        this.CLASSES.forEach((blob, k) => {
            for (let i = 0; i < 5; i++) {
                let x = this._gaussianRandom(blob[0][0], blob[0][1])
                let y = this._gaussianRandom(blob[1][0], blob[1][1])
                this.points.push({ x: x, y: y, k: k })
            }
        })
    }

    render() {
        this.points.forEach((point, k) => {
            let element = this.svg.rect(0.5, 0.5)
            if (point.k == 0) {
                element.rx('50%')
            }
            element.center(point.x, point.y)
            element.attr({ 'data-k': point.k })
            this.points[k] = element
        })
    }

    _gaussianRandom(mean = 0, stdev = 1) {
        const u = 1 - Math.random(); // Converting [0,1) to (0,1]
        const v = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        // Transform to the desired mean and standard deviation:
        return z * stdev + mean;
    }

    handleClick(e) {
        // Get click position inside SVG's viewbox
        let pointer = this.svg.point(e.clientX, e.clientY)
        const screenCTM = this.svg.node.getScreenCTM()
        pointer.transform(screenCTM.inverse())

        // Create / Animate the cursor
        if (!this.cursor) {
            this.cursor = this.svg.rect(0.5, 0.5).rx(0.25)
        }
        this.cursor.timeline().finish()
        let animation = this.cursor.animate()
        animation.center(pointer.x, pointer.y)

        // Find k-neighbors
        let distances = this.points.map(point => {
            return (point.cx() - pointer.x) ** 2 + (point.cy() - pointer.y) ** 2
        })
        let indices = [...distances.keys()].sort((a, b) => distances[a] - distances[b])

        this.paths.clear()
        indices.forEach((index, k) => {
            if (k < this.K) {
                this.points[index].addClass('active')
                let line = this.paths.path(`M ${pointer.x} ${pointer.y} L ${this.points[index].cx()} ${this.points[index].cy()}`)
                line.attr({ 'stroke-dashoffset': line.length(), 'stroke-dasharray': line.length() }).stroke({ width: 0.05 })
                line.animate().attr({ 'stroke-dashoffset': 0 })
            } else {
                this.points[index].removeClass('active')
            }
        })

        // Find class (only works for two classes)
        let guessedClass = indices.slice(0, this.K).reduce((acc, index) => {
            if (this.points[index].attr('data-k') == 0) {
                acc -= 1
            } else {
                acc += 1
            }
            return acc
        }, 0) > 0

        if (guessedClass) {
            animation.rx(0)
        } else {
            animation.rx(0.25)
        }
    }

}

customElements.define('x-knn', KNN)
