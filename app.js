const WIKI_API = 'https://en.wikipedia.org/w/api.php';

const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const cardTemplate = document.getElementById('card-template');

let activeController = null;

if (form && input && statusEl && resultsEl && cardTemplate) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const query = input.value.trim();
    if (!query) {
      setStatus('Please enter a search term.');
      return;
    }

    if (activeController) {
      activeController.abort();
    }
    activeController = new AbortController();

    clearResults();
    setStatus('Searching Wikipedia...');

    try {
      const pages = await fetchImages(query, activeController.signal);

      if (!pages.length) {
        setStatus(`No image-heavy results found for "${query}".`);
        return;
      }

      const cards = pages.map((page) => buildCard(page)).filter(Boolean);
      resultsEl.append(...cards);
      setStatus(`Found ${cards.length} results for "${query}".`);
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      console.error('Search failed:', error);
      setStatus('Could not reach Wikipedia right now. Please try again.');
    }
  });
} else {
  console.error('App initialization failed: missing expected DOM elements.');
}

function setStatus(message) {
  statusEl.textContent = message;
}

function clearResults() {
  resultsEl.replaceChildren();
}

async function fetchImages(query, signal) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '20',
    prop: 'pageimages|extracts|info',
    exintro: '1',
    explaintext: '1',
    exchars: '160',
    inprop: 'url',
    piprop: 'thumbnail|original',
    pithumbsize: '500'
  });

  const response = await fetch(`${WIKI_API}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`Wikipedia request failed (${response.status})`);
  }

  const data = await response.json();
  const pages = Object.values(data?.query?.pages ?? {});

  return pages
    .map((page) => ({
      title: page?.title ?? 'Untitled article',
      image: page?.thumbnail?.source || page?.original?.source || '',
      extract: page?.extract || 'No description available.',
      url: page?.fullurl || `https://en.wikipedia.org/?curid=${page?.pageid ?? ''}`
    }))
    .filter((page) => page.image && page.url);
}

function buildCard(page) {
  const fragment = cardTemplate.content.cloneNode(true);
  const link = fragment.querySelector('.card-link');
  const image = fragment.querySelector('.card-image');
  const title = fragment.querySelector('.card-title');
  const extract = fragment.querySelector('.card-extract');

  if (!link || !image || !title || !extract) {
    return null;
  }

  link.href = page.url;
  image.src = page.image;
  image.alt = `${page.title} image`;
  title.textContent = page.title;
  extract.textContent = page.extract;

  return fragment;
}
