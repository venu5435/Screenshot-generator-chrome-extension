/**
 * Website Screenshots Generator - Link Discovery & Crawler
 * Handles URL normalization, domain restriction, non-HTML filtering, and BFS depth-controlled crawling.
 */

// File extensions that should NOT be crawled or screenshotted as HTML pages
const IGNORED_EXTENSIONS = new Set([
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff', 'avif',
  // Documents & Data
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'json', 'xml', 'rss', 'atom', 'txt',
  // Media
  'mp4', 'mp3', 'wav', 'avi', 'mov', 'webm', 'ogg', 'flac', 'mkv',
  // Archives & Executables
  'zip', 'tar', 'gz', '7z', 'rar', 'bz2', 'exe', 'dmg', 'apk', 'iso',
  // Code & Web Assets
  'css', 'js', 'mjs', 'map', 'woff', 'woff2', 'ttf', 'eot', 'otf'
]);

// Ignored URL query parameter keys (tracking, session, etc.)
const STRIPPED_QUERY_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', '_ga', '_gl', 'ref'
]);

/**
 * Normalizes a URL against a base origin, removing hashes, trailing slashes, and tracking params.
 * @param {string} rawUrl - The URL or relative path to normalize.
 * @param {string} baseUrl - The base page URL to resolve relative paths against.
 * @param {string} baseOrigin - The required origin (protocol + hostname + port).
 * @returns {string|null} - Normalized URL string or null if invalid / external / ignored.
 */
export function normalizeUrl(rawUrl, baseUrl, baseOrigin) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return null;
  }

  let resolvedUrl;
  try {
    resolvedUrl = new URL(trimmed, baseUrl);
  } catch {
    return null;
  }

  // Must be http or https
  if (resolvedUrl.protocol !== 'http:' && resolvedUrl.protocol !== 'https:') {
    return null;
  }

  // Strictly enforce same hostname / origin
  const baseOriginUrl = new URL(baseOrigin);
  if (resolvedUrl.hostname.toLowerCase() !== baseOriginUrl.hostname.toLowerCase()) {
    return null;
  }

  // Strip hash fragment
  resolvedUrl.hash = '';

  // Filter out non-HTML file extensions from pathname
  const pathname = resolvedUrl.pathname.toLowerCase();
  const lastSegment = pathname.split('/').pop() || '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = lastSegment.slice(dotIndex + 1);
    if (IGNORED_EXTENSIONS.has(ext)) {
      return null;
    }
  }

  // Strip tracking parameters
  const keysToDelete = [];
  for (const [key] of resolvedUrl.searchParams.entries()) {
    if (STRIPPED_QUERY_PARAMS.has(key.toLowerCase()) || key.startsWith('utm_')) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(k => resolvedUrl.searchParams.delete(k));

  // Normalize trailing slash: remove trailing slash if path is longer than '/'
  let finalHref = resolvedUrl.href;
  if (resolvedUrl.pathname.length > 1 && resolvedUrl.pathname.endsWith('/') && !resolvedUrl.search) {
    finalHref = finalHref.slice(0, -1);
  }

  return finalHref;
}

/**
 * Extracts all valid internal anchor links from raw HTML content.
 * @param {string} html - HTML string of the page.
 * @param {string} currentUrl - URL of the page being parsed.
 * @param {string} baseOrigin - Origin to restrict links to.
 * @returns {string[]} - Array of unique normalized internal URLs.
 */
export function extractLinksFromHtml(html, currentUrl, baseOrigin) {
  if (!html || typeof html !== 'string') return [];

  const links = new Set();
  const anchorRegex = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>\s]+))[^>]*>/gi;
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    const rawHref = match[1] || match[2] || match[3];
    if (rawHref) {
      const normalized = normalizeUrl(rawHref, currentUrl, baseOrigin);
      if (normalized) {
        links.add(normalized);
      }
    }
  }

  return Array.from(links);
}

/**
 * Generates a clean, filesystem-safe filename slug for a page.
 * @param {string} urlString - URL of the page.
 * @param {number} index - 1-based page index.
 * @returns {string} - Clean slug, e.g. "page-01-home" or "page-02-pricing-plans".
 */
export function createPageSlug(urlString, index) {
  try {
    const url = new URL(urlString);
    let path = url.pathname.replace(/^\/+|\/+$/g, ''); // Trim slashes
    if (!path) {
      path = 'home';
    } else {
      path = path
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
    }

    if (url.search) {
      const searchClean = url.search
        .replace(/^\?/, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 30);
      if (searchClean) {
        path += `-${searchClean}`;
      }
    }

    const paddedIndex = String(index).padStart(2, '0');
    return `page-${paddedIndex}-${path || 'page'}`;
  } catch {
    const paddedIndex = String(index).padStart(2, '0');
    return `page-${paddedIndex}-page`;
  }
}

/**
 * Crawls a website origin starting from a seed URL using Breadth-First Search (BFS).
 * @param {string} seedUrl - The initial URL to crawl.
 * @param {object} options - Options object.
 * @param {number} [options.maxPages=5] - Maximum total pages to discover.
 * @param {number} [options.maxDepth=1] - Maximum link traversal depth (0 = seed only, 1 = seed + immediate links, etc.).
 * @param {function} [options.onProgress] - Optional callback (e.g. { discoveredCount, currentUrl, message }).
 * @param {function} [options.checkCancelled] - Optional callback returning true if job should abort.
 * @returns {Promise<string[]>} - List of discovered unique page URLs.
 */
export async function crawlOrigin(seedUrl, options = {}) {
  const {
    maxPages = 5,
    maxDepth = 1,
    onProgress = () => {},
    checkCancelled = () => false
  } = options;

  let seedParsed;
  try {
    seedParsed = new URL(seedUrl);
  } catch {
    throw new Error(`Invalid Seed URL: "${seedUrl}"`);
  }

  const baseOrigin = seedParsed.origin;
  const normalizedSeed = normalizeUrl(seedUrl, seedUrl, baseOrigin) || seedParsed.href;

  const queue = [{ url: normalizedSeed, depth: 0 }];
  const visited = new Set();
  const discovered = [normalizedSeed];
  visited.add(normalizedSeed);

  onProgress({
    discoveredCount: discovered.length,
    currentUrl: normalizedSeed,
    message: `Starting crawl on ${baseOrigin} (Max ${maxPages} pages, Depth ${maxDepth})...`
  });

  while (queue.length > 0 && discovered.length < maxPages) {
    if (checkCancelled()) {
      break;
    }

    const { url, depth } = queue.shift();

    if (depth >= maxDepth) {
      // Don't fetch child links if we've reached max crawl depth
      continue;
    }

    onProgress({
      discoveredCount: discovered.length,
      currentUrl: url,
      message: `Analyzing links from ${url} (Depth ${depth}/${maxDepth})...`
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || (!contentType.includes('text/html') && !contentType.includes('xhtml'))) {
        continue;
      }

      const html = await response.text();
      const extractedLinks = extractLinksFromHtml(html, url, baseOrigin);

      for (const nextUrl of extractedLinks) {
        if (!visited.has(nextUrl)) {
          visited.add(nextUrl);
          discovered.push(nextUrl);
          queue.push({ url: nextUrl, depth: depth + 1 });

          onProgress({
            discoveredCount: discovered.length,
            currentUrl: nextUrl,
            message: `Discovered [${discovered.length}/${maxPages}]: ${nextUrl}`
          });

          if (discovered.length >= maxPages) {
            break;
          }
        }
      }
    } catch (err) {
      // Ignore individual page fetch errors during crawl, continue with other links
      onProgress({
        discoveredCount: discovered.length,
        currentUrl: url,
        message: `Warning: Could not fetch child links from ${url} (${err.message})`
      });
    }
  }

  return discovered.slice(0, maxPages);
}
