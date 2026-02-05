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
      setStatus('Please enter a product name.');
      return;
    }

    if (activeController) {
      activeController.abort();
    }
    activeController = new AbortController();

    clearResults();
    setStatus('Searching the internet for best 3D product images...');

    try {
      const payload = await fetchCurated3DResults(query, activeController.signal);
      const items = payload.items || [];

      if (!items.length) {
        setStatus(`No curated 3D images found for "${query}".`);
        return;
      }

      const cards = items.map((item, index) => buildCard(item, index === 0)).filter(Boolean);
      resultsEl.append(...cards);

      setStatus(`Showing ${items.length} curated 3D image results for "${query}".`);
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      console.error('Search failed:', error);
      setStatus('Could not fetch curated 3D results right now. Please try again.');
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

async function fetchCurated3DResults(query, signal) {
  const params = new URLSearchParams({ q: query, limit: '4' });
  const response = await fetch(`/api/search-3d?${params.toString()}`, { signal });

  if (!response.ok) {
    throw new Error(`Curated API request failed (${response.status})`);
  }

  return response.json();
}

function buildCard(item, isBestMatch) {
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.card');
  const link = fragment.querySelector('.card-link');
  const image = fragment.querySelector('.card-image');
  const title = fragment.querySelector('.card-title');
  const extract = fragment.querySelector('.card-extract');

  if (!card || !link || !image || !title || !extract) {
    return null;
  }

  if (isBestMatch) {
    card.classList.add('best-match');
  }

  link.href = item.pageUrl;
  image.src = item.image;
  image.alt = `${item.title} 3D visual`;
  title.textContent = isBestMatch ? `⭐ Best match: ${item.title}` : item.title;
  extract.textContent = item.description || 'Curated 3D result.';

  return fragment;
}
