class ViolinBook extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const title = this.getAttribute('title') || 'Title';
    const author = this.getAttribute('author') || 'Author';
    const year = this.getAttribute('year') || '1860';
    const pageNum = this.getAttribute('page') || '62';
    const citation = this.innerHTML || 'Citation text here...';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --book-w: 350px;
          --book-h: 500px;
          --paper: #fdf6e3;
          --cover-bg: #5b2d2d;
          --gold: #d4af37;
          
          display: block;
          /* The host is 2x width to act as a container for the full spread */
          width: calc(var(--book-w) * 2);
          height: var(--book-h);
          /* Add the margin so the 'closed' book appears centered on its own axis */
          /* 1. Force crisp font rendering */
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
          margin: 0 auto;
        }

        .content-page, .book-base, .cover {
          /* 2. Force hardware acceleration on the flat surfaces */
          transform: translateZ(1px);
        }

        .viewport {
          perspective: 2000px;
          width: 100%;
          height: 100%;
          position: relative;
        }

        .book {
          position: absolute;
          /* Anchor the book to the right half of the component */
          right: 0;
          width: var(--book-w);
          height: var(--book-h);
          transform-style: preserve-3d;
          cursor: pointer;
          /* No translateX here: the right side stays fixed */
        }

        .leaf {
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
          transform-origin: left center;
          transition: transform 1.2s cubic-bezier(0.4, 0, 0.2, 1);
          transform-style: preserve-3d;
          border-radius: 0 5px 5px 0;
        //   backface-visibility: hidden;
        }

        /* --- THE COVER --- */
        .cover {
          background: var(--cover-bg);
          color: var(--gold);
          z-index: 100;
          padding: 30px;
          box-sizing: border-box;
          border-left: 5px solid rgba(0,0,0,0.4);
          transition-delay: 0.3s; /* Delay when closing */
        }
        .book.open .cover { 
          transform: rotateY(-155deg); 
          transition-delay: 0s; /* No delay when opening */
        }

        .cover-design {
          border: 2px solid var(--gold);
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          font-family: serif;
        }

        /* --- FAKE PAGES --- */
        .fake-page { background: var(--paper); box-shadow: inset 5px 0 10px rgba(0,0,0,0.1); }
        .p1 { z-index: 90; transition-delay: 0.2s; }
        .p2 { z-index: 80; transition-delay: 0.1s; }
        .p3 { z-index: 70; transition-delay: 0s; }

        .book.open .p1 { transform: rotateY(-150deg); transition-delay: 0.1s; }
        .book.open .p2 { transform: rotateY(-145deg); transition-delay: 0.2s; }
        .book.open .p3 { transform: rotateY(-140deg); transition-delay: 0.3s; }

        /* --- THE SPREAD --- */
        .p3-back {
          position: absolute;
          width: 100%;
          height: 100%;
          background: var(--paper);
          transform: rotateY(180deg);
          padding: 50px 40px;
          box-sizing: border-box;
          font-family: serif;
          color: #999;
          font-style: italic;
          border-radius: 5px 0 0 5px;
          box-shadow: inset -10px 0 20px rgba(0,0,0,0.05);
        }

        .book-base {
          position: absolute;
          width: 100%;
          height: 100%;
          background: var(--paper);
          z-index: 10;
          padding: 50px 40px;
          box-sizing: border-box;
          border-radius: 0 5px 5px 0;
          box-shadow: 5px 10px 30px rgba(0,0,0,0.3);
          font-family: "Georgia", serif;
        }

        .pg-num { font-size: 0.8rem; color: #888; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 20px; }
        .citation-text { font-size: 1.3rem; line-height: 1.7; color: #111; margin: 0; }
        .footer { text-align: right; font-size: 0.8rem; color: #888; font-style: italic; margin-top: 30px; }

        .hl {
          background-image: linear-gradient(120deg, rgba(255, 230, 0, 0.4) 0%, rgba(255, 230, 0, 0.4) 100%);
          background-repeat: no-repeat;
          background-size: 0% 100%;
          transition: background-size 0.8s ease-out;
        }
        .book.open .hl {
          background-size: 100% 100%;
          transition-delay: 1.4s;
        }
      </style>

      <div class="viewport">
        <div class="book" id="bookElement">
          <div class="book-base">
            <div class="pg-num">${pageNum}</div>
            <p class="citation-text">${citation}</p>
            <div class="footer">— ${author}, ${year}</div>
          </div>

          <div class="leaf fake-page p3">
            <div class="p3-back">
              <div class="pg-num">${parseInt(pageNum) - 1}</div>
            </div>
          </div>

          <div class="leaf fake-page p2"></div>
          <div class="leaf fake-page p1"></div>

          <div class="leaf cover">
            <div class="cover-design">
              <h1 style="font-size: 1.4rem; margin: 0;">${title}</h1>
              <hr style="width: 40%; border: 0; border-top: 1px solid var(--gold); margin: 20px 0;">
              <p style="margin: 0;">${author}</p>
              <div style="margin-top: 20px;">${year}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const book = this.shadowRoot.getElementById('bookElement');
    book.addEventListener('click', () => book.classList.toggle('open'));
  }
}

customElements.define('violin-book', ViolinBook);