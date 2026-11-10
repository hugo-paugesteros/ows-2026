import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

// Only one excerpt plays at a time, so that two violins can be compared
let playing = null

class Object3D extends HTMLElement {

    constructor() {
        super()

        this.shadow = this.attachShadow({ mode: "open" })
        this.shadow.innerHTML = `
        <style>
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }
            canvas {
                width: 100%;
                height: 100%;
            }
            :host([sound]) {
                cursor: pointer;
            }
        </style>
        `

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping
        this.renderer.toneMappingExposure = 0.7
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        // this.renderer.shadowMap.enabled = true
        // this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
        // Render at the screen's actual pixel density (capped at 2x so very
        // high-DPI displays don't tank performance) - without this the
        // canvas renders soft/blurry on any retina-class display.
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.loader = new GLTFLoader()

        this.shadow.appendChild(this.renderer.domElement)

        this.camera.position.x = 0;
        this.camera.position.y = 0.5;
        this.camera.position.z = 2.5;
        this.camera.lookAt(new THREE.Vector3(0, 0.5, 0))

        // Studio/product-shot lighting: a soft room environment for
        // ambient fill and realistic reflections on the instruments'
        // varnish, plus a single key light for a crisp highlight and
        // a bit of definition (the "turntable ad" look).
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer)
        this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(2, 3, 2)
        // keyLight.castShadow = true
        // keyLight.shadow.mapSize.set(2048, 2048)
        // keyLight.shadow.camera.near = 0.1
        // keyLight.shadow.camera.far = 10
        // keyLight.shadow.camera.left = -1.5
        // keyLight.shadow.camera.right = 1.5
        // keyLight.shadow.camera.top = 1.5
        // keyLight.shadow.camera.bottom = -1.5
        // keyLight.shadow.radius = 4
        this.scene.add(keyLight);

        // A shadow-only plane: invisible except for the soft contact shadow
        // it receives, so it blends into the page's white background.
        // const ground = new THREE.Mesh(
        //     new THREE.PlaneGeometry(10, 10),
        //     new THREE.ShadowMaterial({ opacity: 0.25 })
        // )
        // ground.rotation.x = -Math.PI / 2
        // ground.receiveShadow = true
        // this.scene.add(ground)

        this.loadObject(this.getAttribute('data-url'))

        this.renderer.setAnimationLoop(() => this.animate())

        new ResizeObserver(() => this.resize()).observe(this)

        // sound="…": a click plays or pauses that excerpt
        if (this.hasAttribute('sound')) {
            this.audio = new Audio(this.getAttribute('sound'))
            this.addEventListener('click', () => this.toggle())
        }
    }

    connectedCallback() {
        if (!this.audio) return
        Reveal.on('slidechanged', () => {
            if (!this.closest('section').classList.contains('present')) this.audio.pause()
        })
    }

    toggle() {
        if (!this.audio.paused) return this.audio.pause()
        if (playing && playing !== this.audio) playing.pause()
        playing = this.audio
        this.audio.play()
    }

    loadObject(path) {
        let violin
        this.loader.load(path, (gltf) => {
            let root = gltf.scene
            violin = root.getObjectByName('Sketchfab_model');
            if (path == 'stradivari_violin/scene.gltf') {
                violin.rotation.x = Math.PI / 180 * (-90)
            }
            let bb = new THREE.Box3().setFromObject(violin)

            let scale
            if (path == 'trumpet/scene.gltf') {
                scale = 1 / (bb.max.x - bb.min.x)
            } else {
                scale = 1 / (bb.max.y - bb.min.y)
            }
            violin.scale.set(scale, scale, scale)
            bb = new THREE.Box3().setFromObject(violin)
            violin.position.x = 0
            violin.position.y += path != 'trumpet/scene.gltf' ? -bb.min.y : 0.5 - (bb.max.y - bb.min.y) / 2 - bb.min.y
            violin.position.z = 0
            const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy()
            violin.traverse((child) => {
                if (!child.isMesh) return
                // child.castShadow = true
                for (const map of [child.material.map, child.material.normalMap, child.material.roughnessMap, child.material.metalnessMap]) {
                    if (map) map.anisotropy = maxAnisotropy
                }
            })
            this.scene.add(root)

            this.object = violin
            this.resize()
        }, undefined, function (error) {
            console.error(error)
        })
        return violin
    }

    animate() {
        if (this.object) {
            this.object.rotation.z += 0.005
        }
        this.renderer.render(this.scene, this.camera)
    }

    resize() {
        const canvas = this.renderer.domElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return

        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

}

customElements.define('x-object3d', Object3D)
