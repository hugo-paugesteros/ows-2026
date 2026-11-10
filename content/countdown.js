const pad = n => String(n).padStart(2, '0')

const UNITS = ['heure', 'minute', 'seconde']
const CLASSES = ['hours', 'minutes', 'seconds']

class Countdown extends HTMLElement {

    constructor() {
        super()
        this.attachShadow({ mode: 'open' }).innerHTML = `
            <style>
                :host {
                    display: grid;
                    grid-template-columns: repeat(5, auto);
                    justify-content: center;
                    justify-items: center;
                    column-gap: 0.2em;
                    font-variant-numeric: tabular-nums;
                }
                :host(.late) {
                    color: var(--test);
                }
                .number {
                    grid-row: 1;
                    position: relative;
                }
                /* The sign sits left of the hours, so being late does not shift the layout */
                :host(.late) .hours::before {
                    content: '−';
                    position: absolute;
                    right: 100%;
                }
                .unit {
                    grid-row: 2;
                    font-size: 0.4em;
                }
            </style>
            ${UNITS.map((_, i) => `<span class="number ${CLASSES[i]}" style="grid-column: ${2 * i + 1}"></span>`).join('<span>:</span>')}
            ${UNITS.map((_, i) => `<span class="unit" style="grid-column: ${2 * i + 1}"></span>`).join('')}
        `
        this.numbers = this.shadowRoot.querySelectorAll('.number')
        this.units = this.shadowRoot.querySelectorAll('.unit')
    }

    // Target time of the day, "14:00" by default (or e.g. <x-countdown at="14:30">)
    get target() {
        const [hours, minutes] = (this.getAttribute('at') ?? '14:00').split(':').map(Number)
        const target = new Date()
        target.setHours(hours, minutes, 0, 0)
        return target
    }

    connectedCallback() {
        const tick = () => {
            this.update()
            // Wake up right after the next second boundary
            this.timeout = setTimeout(tick, 1000 - Date.now() % 1000 + 10)
        }
        tick()
    }

    disconnectedCallback() {
        clearTimeout(this.timeout)
    }

    update() {
        const seconds = Math.ceil((this.target - Date.now()) / 1000)
        const s = Math.abs(seconds)
        const values = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
        this.classList.toggle('late', seconds < 0)
        values.forEach((value, i) => {
            this.numbers[i].textContent = pad(value)
            // French: singular for 0 and 1
            this.units[i].textContent = UNITS[i] + (value > 1 ? 's' : '')
        })
    }

}

customElements.define('x-countdown', Countdown)
