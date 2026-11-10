// Source-filter estimation of x-source-filter, reduced to the harmonic peaks:
// each frame is fitted by the pitch-shifted dictionary atom closest to it,
// the atom is removed (dB difference) and what remains is averaged into the filter.
// Same steps as SourceFilterOptim, but online: each frame uses the filter estimated so far.
import { FMIN, FMAX, logT, filterDb, radiativity } from './spectrum.js'
import dictionary from './source-atoms-data.js'

export const { atoms } = dictionary
export const F0_REF = dictionary.f0
export const F0_MIN = 200, F0_MAX = 1200
const N_BINS = 30
const NOISE_DB = 1.5

const mean = values => values.reduce((a, b) => a + b, 0) / values.length

// Mean level of the true filter: the estimate is only known up to a constant (mean normalization)
export const FILTER_MEAN = mean(radiativity.map(([, db]) => db))

export function harmonics(f0) {
    const ks = []
    for (let k = 1; k * f0 <= FMAX && k <= atoms[0].length; k++) ks.push(k)
    return ks
}

// Seeded, so the demo is the same at every rehearsal
export function random(seed) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function gaussian(rand) {
    return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
}

// A recorded frame: one of the measured string spectra, through the violin filter
export function makeFrame(f0, atom, rand) {
    const gain = 10 * (rand() - 0.5)
    const ks = harmonics(f0)
    return {
        f0, atom, ks,
        obs: ks.map(k => atoms[atom][k - 1] + filterDb(k * f0) + gain + NOISE_DB * gaussian(rand)),
    }
}

export function randomFrame(rand) {
    return makeFrame(F0_MIN * Math.pow(F0_MAX / F0_MIN, rand()), Math.floor(3 * rand()), rand)
}

// Running mean of dB values in log-spaced frequency bins
class BinnedMean {
    sums = new Array(N_BINS).fill(0)
    counts = new Array(N_BINS).fill(0)

    bin(freq) {
        return Math.max(0, Math.min(N_BINS - 1, Math.floor(logT(freq) * N_BINS)))
    }

    add(freq, db) {
        const i = this.bin(freq)
        this.sums[i] += db
        this.counts[i]++
    }

    at(freq) {
        const i = this.bin(freq)
        return this.counts[i] ? this.sums[i] / this.counts[i] : 0
    }

    // [frequency, dB] per bin, null where no point fell
    curve() {
        return this.sums.map((sum, i) => this.counts[i]
            ? [FMIN * Math.pow(FMAX / FMIN, (i + 0.5) / N_BINS), sum / this.counts[i]]
            : null)
    }
}

export class Estimator {
    filter = new BinnedMean()
    ltas = new BinnedMean()

    // E-step: level-match every atom to the frame, keep the one closest to it once the filter is removed
    fit({ f0, ks, obs }) {
        const candidates = atoms.map(atom => {
            const diff = ks.map((k, i) => obs[i] - atom[k - 1])
            const offset = mean(diff)
            const residual = diff.map(d => d - offset)
            const error = residual.reduce((sum, r, i) => sum + (r - this.filter.at(ks[i] * f0)) ** 2, 0)
            return { offset, residual, error }
        })
        const best = candidates.reduce((b, c, j) => c.error < candidates[b].error ? j : b, 0)
        return { candidates, best }
    }

    // M-step: what remains after removing the chosen atom goes into the filter estimate
    add(frame, { candidates, best }) {
        frame.ks.forEach((k, i) => {
            this.filter.add(k * frame.f0, candidates[best].residual[i])
            this.ltas.add(k * frame.f0, frame.obs[i])
        })
    }

    filterCurve() {
        return this.filter.curve().map(bin => bin && [bin[0], bin[1] + FILTER_MEAN])
    }

    // Plain average of the recording, only its shape matters: brought to the filter's mean level
    ltasCurve() {
        const curve = this.ltas.curve()
        const level = mean(curve.filter(Boolean).map(([, db]) => db))
        return curve.map(bin => bin && [bin[0], bin[1] - level + FILTER_MEAN])
    }
}
