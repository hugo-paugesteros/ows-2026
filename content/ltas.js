import { FMIN, FMAX, logT, radiativity, filterDb } from './spectrum.js'

const DB_MIN = -20, DB_MAX = 25
const F0_MIN = 200, F0_MAX = 2000

function xPos(freq, region) {
    return region.x0 + logT(freq) * region.w
}

function yPos(db, region) {
    const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db))
    const t = (clamped - DB_MIN) / (DB_MAX - DB_MIN)
    return region.y0 + (1 - t) * region.h
}

// Helmholtz (sawtooth) string motion: all harmonics, amplitude in 1/k
function sourceDb(k) {
    return -20 * Math.log10(k)
}

function harmonicsOf(f0) {
    const kMax = Math.floor(FMAX / f0)
    const ks = []
    for (let k = 1; k <= kMax; k++) ks.push(k)
    return ks
}

class LTAS extends HTMLElement {

    regions = {
        source: { x0: 2, y0: 2, w: 96, h: 46 },
        filter: { x0: 2, y0: 2, w: 96, h: 46 },
        result: { x0: 2, y0: 2, w: 196, h: 56 },
    }

    pitches = []
    accumPoints = []

    constructor() {
        super()

        const shadow = this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                }
                .layout {
                    display: grid;
                    grid-template-columns: 1fr auto 1fr;
                    grid-template-areas:
                        "source times filter"
                        "equals equals equals"
                        "result result result";
                    align-items: center;
                    gap: 0.2em 0.6em;
                }
                svg {
                    width: 100%;
                    overflow: visible;
                    display: block;
                }
                .source-svg { grid-area: source; max-height: 190px; }
                .filter-svg { grid-area: filter; max-height: 190px; }
                .result-svg { grid-area: result; max-height: 240px; }
                .op-sign {
                    font-size: 1.6rem;
                    text-align: center;
                }
                .times-sign { grid-area: times; }
                .equals-sign { grid-area: equals; }
                .curve {
                    fill: none;
                    stroke: var(--control);
                    stroke-width: 0.6;
                }
                .ref-curve {
                    fill: none;
                    stroke: black;
                    stroke-width: 0.4;
                }
                .comb line {
                    stroke: var(--control);
                }
                .comb circle {
                    fill: var(--control);
                    stroke: none;
                }
                .live circle, .live line {
                    stroke: var(--test);
                    fill: var(--test);
                }
                .accum circle {
                    fill: var(--ltas-accum);
                    stroke: none;
                }
                .mean-curve {
                    fill: none;
                    stroke: var(--ltas-mean);
                    stroke-width: 0.6;
                }
                .controls {
                    display: flex;
                    align-items: center;
                    gap: 0.6em;
                    margin-top: 0.6em;
                }
                .controls input[type="range"] {
                    flex: 1;
                }
                .controls button {
                    font: inherit;
                    cursor: pointer;
                    font-size: .4em;
                }
            </style>
            <div class="layout">
                <svg class="source-svg" viewBox="0 0 100 50"></svg>
                <div class="op-sign times-sign">&times;</div>
                <svg class="filter-svg" viewBox="0 0 100 50"></svg>
                <div class="op-sign equals-sign">=</div>
                <svg class="result-svg" viewBox="0 0 200 60"></svg>
            </div>
            <div class="controls">
                <input type="range" class="pitch" min="0" max="1000" value="500">
                <!--<button type="button" class="add">Ajouter</button>-->
                <button type="button" class="random">Al&eacute;atoire</button>
                <button type="button" class="mean">Moyenne</button>
                <button type="button" class="clear">Effacer</button>
            </div>
        `

        this.sourceSvg = SVG(shadow.querySelector('.source-svg'))
        this.filterSvg = SVG(shadow.querySelector('.filter-svg'))
        this.resultSvg = SVG(shadow.querySelector('.result-svg'))
        this.pitchInput = shadow.querySelector('.pitch')

        this.buildStaticLayers()

        this.sourceGroup = this.sourceSvg.group().addClass('comb')
        this.resultLiveGroup = this.resultSvg.group().addClass('comb live')
        this.resultAccumGroup = this.resultSvg.group()
        this.meanGroup = this.resultSvg.group()

        this.pitchInput.addEventListener('input', () => this.updateLive())
        // shadow.querySelector('.add').addEventListener('click', () => this.commitPitch())
        shadow.querySelector('.random').addEventListener('click', () => this.addRandom())
        shadow.querySelector('.mean').addEventListener('click', () => this.drawMean())
        shadow.querySelector('.clear').addEventListener('click', () => this.clear())

        this.updateLive()
    }

    get f0() {
        const t = this.pitchInput.value / 1000
        return F0_MIN * Math.pow(F0_MAX / F0_MIN, t)
    }

    setPitch(f0) {
        const t = Math.log(f0 / F0_MIN) / Math.log(F0_MAX / F0_MIN)
        this.pitchInput.value = Math.round(t * 1000)
        this.updateLive()
    }

    buildStaticLayers() {
        const filterPoints = radiativity.map(([freq, db]) => [xPos(freq, this.regions.filter), yPos(db, this.regions.filter)])
        this.filterSvg.polyline(filterPoints).addClass('curve')

        const refPoints = radiativity.map(([freq, db]) => [xPos(freq, this.regions.result), yPos(db, this.regions.result)])
        // this.resultSvg.polyline(refPoints).addClass('ref-curve')
    }

    drawComb(group, region, points, { stems = true } = {}) {
        group.clear()
        points.forEach(([freq, db], i) => {
            const k = i + 1
            const x = xPos(freq, region)
            const yTop = yPos(db, region)
            const opacity = Math.max(0.12, 1 / k)
            if (stems) {
                const yBase = region.y0 + region.h
                group.line(x, yBase, x, yTop).stroke({ width: 0.4, opacity })
            }
            group.circle(1.6 / Math.sqrt(k)).center(x, yTop).attr({ opacity })
        })
    }

    resultPointsFor(f0) {
        return harmonicsOf(f0).map(k => [k * f0, sourceDb(k) + filterDb(k * f0)])
    }

    updateLive() {
        const f0 = this.f0
        const harmonics = harmonicsOf(f0)
        this.drawComb(this.sourceGroup, this.regions.source, harmonics.map(k => [k * f0, sourceDb(k)]))
        this.drawComb(this.resultLiveGroup, this.regions.result, this.resultPointsFor(f0))
    }

    commitPitch(f0 = this.f0) {
        this.pitches.push(f0)
        const points = this.resultPointsFor(f0)
        this.accumPoints.push(...points)
        const group = this.resultAccumGroup.group().addClass('accum')
        this.drawComb(group, this.regions.result, points, { stems: false })
        group.opacity(0)
        group.animate(400).attr({ opacity: 1 })
    }

    // Mean spectrum from the accumulated points, log-binned; bins with no
    // point are left as holes rather than interpolated.
    computeMean(n = 50) {
        const logMin = Math.log10(FMIN), logMax = Math.log10(FMAX)
        const sums = new Array(n).fill(0)
        const counts = new Array(n).fill(0)
        this.accumPoints.forEach(([freq, db]) => {
            const t = (Math.log10(freq) - logMin) / (logMax - logMin)
            const idx = Math.max(0, Math.min(n - 1, Math.floor(t * n)))
            sums[idx] += db
            counts[idx]++
        })
        const bins = []
        for (let i = 0; i < n; i++) {
            if (counts[i] === 0) {
                bins.push(null)
                continue
            }
            const fc = Math.pow(10, logMin + (i + 0.5) / n * (logMax - logMin))
            bins.push([fc, sums[i] / counts[i]])
        }
        return bins
    }

    drawMean() {
        this.meanGroup.clear()
        const region = this.regions.result
        let segment = []
        this.computeMean().forEach((bin) => {
            if (bin) {
                segment.push([xPos(bin[0], region), yPos(bin[1], region)])
            } else if (segment.length > 1) {
                this.meanGroup.polyline(segment).addClass('mean-curve')
                segment = []
            } else {
                segment = []
            }
        })
        if (segment.length > 1) {
            this.meanGroup.polyline(segment).addClass('mean-curve')
        }
    }

    addRandom(n = 1) {
        for (let i = 0; i < n; i++) {
            const t = Math.random()
            const f0 = F0_MIN * Math.pow(F0_MAX / F0_MIN, t)
            setTimeout(() => {
                this.setPitch(f0)
                this.commitPitch(f0)
            }, i * 0)
        }
    }

    clear() {
        this.pitches = []
        this.accumPoints = []
        this.resultAccumGroup.clear()
        this.meanGroup.clear()
    }

}

customElements.define('x-ltas', LTAS)
