import radiativity from './radiativity-data.js'

export const FMIN = 200, FMAX = 5000

// Position of a frequency on the log axis, 0 at FMIN and 1 at FMAX
export function logT(freq) {
    return (Math.log10(freq) - Math.log10(FMIN)) / (Math.log10(FMAX) - Math.log10(FMIN))
}

// Linear interpolation on the measured radiativity curve (log-spaced samples)
export function filterDb(freq) {
    if (freq <= radiativity[0][0]) return radiativity[0][1]
    if (freq >= radiativity[radiativity.length - 1][0]) return radiativity[radiativity.length - 1][1]
    let lo = 0, hi = radiativity.length - 1
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (radiativity[mid][0] < freq) lo = mid; else hi = mid
    }
    const [f1, d1] = radiativity[lo], [f2, d2] = radiativity[hi]
    const t = (Math.log10(freq) - Math.log10(f1)) / (Math.log10(f2) - Math.log10(f1))
    return d1 + t * (d2 - d1)
}

export { radiativity }
