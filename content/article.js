class ArticleStack extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const title = this.getAttribute('title') || 'Title';
    const author = this.getAttribute('author') || 'Author';
    const year = this.getAttribute('year') || '2024';
    const content = this.innerHTML.trim() || 'Article content here...';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --paper-w: 280px;
          --paper: #fdfdfb;
          --ink: #222;
          --accent: #d4af37;

          display: block;
          width: var(--paper-w);
          aspect-ratio: 210 / 297;
          margin: 0 auto;
          position: relative;
          cursor: pointer;
          -webkit-font-smoothing: antialiased;
        }

        .stack {
          position: absolute;
          inset: 0;
        }

        .sheet {
          position: absolute;
          inset: 0;
          background: var(--paper);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
          border-radius: 2px;
          box-sizing: border-box;
          transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.8s ease;
          font-family: "Georgia", serif;
          color: var(--ink);
        }

        /* Resting stack: a slight scattered fan, like papers dropped on a desk.
           Sheet 4 already sits in its final, flat, face-up spot — the first
           three sheets are what hide it. */
        .sheet:nth-child(1) { transform: rotate(-4deg) translate(-2px, 1px); z-index: 4; transition-delay: 0.2s; }
        .sheet:nth-child(2) { transform: rotate(3deg) translate(3px, -2px); z-index: 3; transition-delay: 0.1s; }
        .sheet:nth-child(3) { transform: rotate(-2deg) translate(-1px, 2px); z-index: 2; transition-delay: 0s; }
        .sheet:nth-child(4) { transform: rotate(0deg); z-index: 1; }

        /* Open: the first three sheets get swept off the card at uneven
           angles, each one moving clear of sheet 4's rectangle entirely —
           z-index never changes (it can't be transitioned smoothly), so
           what reveals sheet 4 is these three simply leaving the frame. */
        :host(.open) .sheet:nth-child(1) {
          transform: translate(-160%, -30%) rotate(-24deg);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
          transition-delay: 0s;
        }
        :host(.open) .sheet:nth-child(2) {
          transform: translate(150%, 50%) rotate(16deg);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
          transition-delay: 0.08s;
        }
        :host(.open) .sheet:nth-child(3) {
          transform: translate(-70%, 160%) rotate(-11deg);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
          transition-delay: 0.16s;
        }
        :host(.open) .sheet:nth-child(4) {
          transform: rotate(0deg) scale(1.03);
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.4);
          transition-delay: 0.24s;
        }

        .cover {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          height: 100%;
          padding: 10%;
          box-sizing: border-box;
        }

        .cover h1 {
          font-size: 1.1rem;
          line-height: 1.3;
          margin: 0 0 1.5rem;
        }

        .cover hr {
          width: 30%;
          border: 0;
          border-top: 1px solid var(--accent);
          margin: 1rem 0;
        }

        .cover .byline {
          font-size: 0.9rem;
          color: #555;
        }

        .cover .year {
          color: var(--accent);
          font-weight: bold;
        }

        .content {
          height: 100%;
          padding: 14% 10%;
          box-sizing: border-box;
          font-size: 0.85rem;
          line-height: 1.6;
          overflow: auto;
        }

        .content canvas {
          max-width: 100%;
        }
      </style>

      <div class="stack">
        <div class="sheet cover">
          <h1>${title}</h1>
          <hr>
          <div class="byline">${author}<br><span class="year">${year}</span></div>
        </div>
        <div class="sheet"></div>
        <div class="sheet"></div>
        <div class="sheet content">${content}</div>
      </div>
    `;

    this.addEventListener('click', () => this.classList.toggle('open'));

    const canvas = this.shadowRoot.querySelector('canvas.chart');
    if (canvas && window.Chart) {
      const labels = (canvas.dataset.labels || '').split(',').map((s) => s.trim());
      const values = (canvas.dataset.values || '').split(',').map(Number);

      new Chart(canvas, {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: ['#d4af37', '#e0e0e0'],
          }],
        },
        options: {
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 10 } } },
          },
        },
      });
    }
  }
}

customElements.define('article-stack', ArticleStack);
