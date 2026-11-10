// Where we are in the talk: the parts on one line, the current one expanded into its steps.
// A slide with data-part="…" starts a part, a slide with data-part-step="…" starts a step of the current
// part, and the following slides inherit both. Hidden before the first part, and on slides with
// data-hide-nav (full-screen ones).

class Breadcrumb extends HTMLElement {

    constructor() {
        super()
        this.attachShadow({ mode: 'open' }).innerHTML = `
            <style>
                :host {
                    position: absolute;
                    bottom: 12px;
                    left: 16px;
                    right: 16px;
                    z-index: 10;
                    font-size: .6em;
                    color: #999;
                    transition: opacity 0.3s ease;
                }
                :host(.hidden) {
                    opacity: 0;
                    pointer-events: none;
                }
                nav {
                    display: flex;
                    justify-content: space-around;
                    gap: 1.5em;
                }
                .current {
                    color: var(--control);
                    font-weight: 600;
                }
                .steps {
                    margin-left: 0.6em;
                    font-weight: 400;
                    color: #999;
                }
            </style>
            <nav></nav>
        `
        this.nav = this.shadowRoot.querySelector('nav')
    }

    connectedCallback() {
        const update = () => this.update()
        if (Reveal.isReady()) update()
        for (const event of ['ready', 'slidechanged']) Reveal.on(event, update)
    }

    // Part and step of every slide, and the steps of every part, in the order of the slides
    outline() {
        const slides = new Map()
        const parts = new Map()
        let part = null
        let step = null
        for (const slide of document.querySelectorAll('.reveal .slides section:not(:has(> section))')) {
            if (slide.dataset.part) {
                part = slide.dataset.part
                step = null
                if (!parts.has(part)) parts.set(part, [])
            }
            if (slide.dataset.partStep && part) {
                step = slide.dataset.partStep
                if (!parts.get(part).includes(step)) parts.get(part).push(step)
            }
            slides.set(slide, { part, step })
        }
        return { slides, parts }
    }

    update() {
        this.map ??= this.outline()
        const slide = Reveal.getCurrentSlide()
        const { part, step } = this.map.slides.get(slide) ?? {}
        this.classList.toggle('hidden', !part || slide.hasAttribute('data-hide-nav'))
        if (!part) return

        const span = (text, current) => {
            const element = document.createElement('span')
            element.textContent = text
            element.classList.toggle('current', current)
            return element
        }
        this.nav.replaceChildren(...[...this.map.parts].map(([name, steps]) => {
            const element = span(name, name === part)
            if (name === part && steps.length) {
                const list = document.createElement('span')
                list.className = 'steps'
                list.append('› ', ...steps.flatMap((s, i) => [...(i ? [' · '] : []), span(s, s === step)]))
                element.append(list)
            }
            return element
        }))
    }

}

customElements.define('x-breadcrumb', Breadcrumb)
