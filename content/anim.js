const cache = new Map()

function loadSvg(src) {
    if (!cache.has(src)) {
        cache.set(src, fetch(src).then(response => response.text()))
    }
    return cache.get(src)
}

class AnimElement extends HTMLElement {

    constructor() {
        super()
        this.attachShadow({ mode: 'open' }).innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    height: 100%;
                }
                svg {
                    width: 100%;
                    height: 100%;
                }
                ${this.constructor.css}
            </style>
        `
    }

    async connectedCallback() {
        if (this.loaded) return
        this.loaded = true
        const svg = await loadSvg(this.constructor.src)
        const template = document.createElement('template')
        template.innerHTML = svg
        this.shadowRoot.append(template.content)
    }
}

function define(tag, file, css) {
    const src = new URL(`./images/${file}`, import.meta.url).href
    customElements.define(tag, class extends AnimElement {
        static src = src
        static css = css
    })
}

const armAndBow = `
    #arm {
        transform-origin: 2% 40%;
        animation: move-arm 1s ease-in-out infinite alternate;
    }
    #bow {
        animation: move-bow 1s ease-in-out infinite alternate;
    }
    @keyframes move-arm {
        0% { transform: rotate(45deg); }
    }
    @keyframes move-bow {
        0% { transform: translateY(25%) translateX(-5%); }
    }
`

define('anim-admittance', 'admittance.svg', `
    #hammer {
        transform-origin: 0% 0%;
        animation: hammer-hit 1s ease-in-out infinite alternate;
    }
    @keyframes hammer-hit {
        0% { transform: rotate(45deg); }
    }
`)

define('anim-recordings', 'recordings.svg', armAndBow)

define('anim-mocap', 'mocap.svg', armAndBow)

define('anim-ratings', 'ratings.svg', `
    #arm {
        transform-box: fill-box;
        transform-origin: 5% 90%;
        animation: move-arm-ratings 1s ease-in-out infinite alternate;
    }
    @keyframes move-arm-ratings {
        0% { transform: rotate(15deg); }
    }
`)

define('anim-listening-tests', 'listening.svg', `
    #arms {
        transform-box: fill-box;
        transform-origin: 50% 50%;
        animation: listening-arms 1s ease-in-out infinite alternate;
    }
    @keyframes listening-arms {
        0% { transform: translateY(15px) scale(1.1); }
    }
`)
