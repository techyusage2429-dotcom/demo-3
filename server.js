const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/search-3d') {
    await handle3DSearch(url, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  serveStatic(url.pathname, res, req.method === 'HEAD');
});

async function handle3DSearch(url, res) {
  try {
    const query = (url.searchParams.get('q') || '').trim();
    if (!query || query.length < 2) {
      sendJson(res, 400, { error: 'Query must be at least 2 characters.' });
      return;
    }

    const limitParam = Number(url.searchParams.get('limit') || 4);
    const limit = Math.max(3, Math.min(4, Number.isFinite(limitParam) ? limitParam : 4));

    const results = await findBest3DImages(query, limit);
    sendJson(res, 200, {
      query,
      resultCount: results.length,
      items: results
    });
  } catch (error) {
    console.error('3D search failed:', error);
    sendJson(res, 200, {
      query: (url.searchParams.get('q') || '').trim(),
      resultCount: 0,
      items: [],
      warning: 'Upstream image sources are temporarily unavailable. Try again shortly.'
    });
  }
}

async function findBest3DImages(query, limit) {
  const candidateQueries = [
    `intitle:${query} 3d render`,
    `${query} 3d model`,
    `${query} isometric cgi`,
    `${query} product render`
  ];

  const all = [];
  for (const candidateQuery of candidateQueries) {
    const pages = await searchCommonsFiles(candidateQuery, 18);
    all.push(...pages);
  }

  const uniqueByTitle = new Map();
  for (const page of all) {
    if (!page || !page.title || uniqueByTitle.has(page.title)) {
      continue;
    }
    const normalized = normalizeCommonsPage(page);
    if (!normalized.image) {
      continue;
    }
    uniqueByTitle.set(page.title, normalized);
  }

  const scored = [...uniqueByTitle.values()]
    .map((item) => ({ ...item, score: scoreItem(item, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...rest }) => rest);

  return scored;
}

async function searchCommonsFiles(query, gsrLimit) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: String(gsrLimit),
    prop: 'imageinfo|info',
    inprop: 'url',
    iiprop: 'url|mime|size|extmetadata'
  });

  const response = await fetch(`${WIKIMEDIA_API}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Wikimedia request failed (${response.status})`);
  }

  const data = await response.json();
  return Object.values(data?.query?.pages || {});
}

function normalizeCommonsPage(page) {
  const info = page?.imageinfo?.[0] || {};
  const metadata = info.extmetadata || {};
  const title = (page.title || '').replace(/^File:/, '');

  return {
    title,
    image: info.url || '',
    description:
      metadata.ImageDescription?.value?.replace(/<[^>]*>/g, '').trim() ||
      metadata.ObjectName?.value ||
      '3D-style visual from Wikimedia Commons.',
    pageUrl: page.fullurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || '')}`,
    width: Number(info.width || 0),
    height: Number(info.height || 0),
    mime: info.mime || ''
  };
}

function scoreItem(item, query) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const title = item.title.toLowerCase();
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter(Boolean);

  let score = 0;

  if (title.includes(q)) score += 12;
  if (title.startsWith(q)) score += 5;

  const keywordBoosts = ['3d', 'render', 'cgi', 'isometric', 'model'];
  for (const keyword of keywordBoosts) {
    if (text.includes(keyword)) {
      score += 3;
    }
  }

  for (const token of tokens) {
    if (title.includes(token)) score += 4;
    else if (text.includes(token)) score += 2;
  }

  if (item.mime.startsWith('image/')) score += 2;

  const area = item.width * item.height;
  if (area >= 1_000_000) score += 2;
  if (area >= 2_000_000) score += 1;

  if (text.includes('disambiguation') || text.includes('logo')) score -= 5;

  return score;
}

function serveStatic(requestPath, res, isHead = false) {
  const safePath = path.normalize(requestPath === '/' ? '/index.html' : requestPath).replace(/^\.+/, '');
  const fullPath = path.join(ROOT, safePath);

  if (!fullPath.startsWith(ROOT)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(fullPath, (error, data) => {
    if (error) {
      if (error.code === 'ENOENT') {
        sendText(res, 404, 'Not Found');
        return;
      }

      sendText(res, 500, 'Internal Server Error');
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    if (isHead) {
      res.end();
      return;
    }
    res.end(data);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
