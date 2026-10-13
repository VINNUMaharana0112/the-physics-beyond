(() => {
  const config = window.TPB_CONFIG || {};
  const projectId = String(config.sanityProjectId || '').trim();
  const dataset = String(config.sanityDataset || 'production').trim();
  const apiVersion = String(config.sanityApiVersion || '2025-01-01').trim();
  if (!/^[a-z0-9-]+$/.test(projectId) || !/^[a-z0-9-]+$/.test(dataset)) return;

  const endpoint = `https://${projectId}.apicdn.sanity.io/v${apiVersion}/data/query/${encodeURIComponent(dataset)}`;
  const query = `*[_type in $types && !(_id in path("drafts.**")) && defined(slug.current)] | order(coalesce(publishedAt, _createdAt) desc){_id,_type,title,"slug":slug.current,description,category,author,priceDisplay,isFree,freeDownloadUrl,platformUrl,affiliateUrl,disclosure,"imageUrl":image.asset->url,"imageAlt":image.alt}`;

  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const safeHref = (value) => {
    try {
      const url = new URL(value, window.location.origin);
      if (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')) return url.href;
    } catch { /* invalid editor URL */ }
    return '';
  };
  const imageNode = (item) => {
    const src = safeHref(item.imageUrl);
    if (!src) return null;
    const image = el('img');
    image.src = src;
    image.alt = item.imageAlt || item.title || '';
    image.loading = 'lazy';
    image.decoding = 'async';
    return image;
  };
  const newTab = (link, href, sponsored = false) => {
    const safe = safeHref(href);
    if (!safe) return false;
    link.href = safe;
    if (new URL(safe).origin !== window.location.origin) {
      link.target = '_blank';
      link.rel = sponsored ? 'sponsored nofollow noopener noreferrer' : 'noopener noreferrer';
    }
    return true;
  };
  const entryUrl = (item) => `/entry/?slug=${encodeURIComponent(item.slug)}`;

  function card(item, kind) {
    const node = el('article', undefined, 'topic-card');
    const image = imageNode(item);
    if (image) node.append(image);
    const labels = { youtubeVideo: 'YOUTUBE', instagramReel: 'INSTAGRAM', physicalBook: 'PRINTED BOOK', digitalProduct: 'DIGITAL PRODUCT', affiliateProduct: 'AFFILIATE RECOMMENDATION' };
    node.append(el('span', item.category || labels[item._type] || 'THE PHYSICS BEYOND', 'category-tag'));
    node.append(el('h3', item.title));
    if (item.author) node.append(el('p', `By ${item.author}`));
    if (item.description) node.append(el('p', item.description));
    if (item._type === 'affiliateProduct') {
      if (item.disclosure) node.append(el('p', item.disclosure, 'purchase-note'));
      const link = el('a', 'View product at retailer →', 'text-link');
      if (newTab(link, item.affiliateUrl, true)) node.append(link);
    } else if (item._type === 'youtubeVideo' || item._type === 'instagramReel') {
      const link = el('a', item._type === 'instagramReel' ? 'Watch on Instagram →' : 'Watch on YouTube →', 'text-link');
      if (newTab(link, item.platformUrl)) node.append(link);
    } else {
      if (item.priceDisplay) node.append(el('p', item.priceDisplay, 'book-listing-price'));
      const link = el('a', kind === 'articles' ? 'Read article →' : 'View details →', 'text-link');
      link.href = entryUrl(item);
      node.append(link);
    }
    return node;
  }

  async function getItems(types) {
    const params = new URLSearchParams({ query, '$types': JSON.stringify(types) });
    const response = await fetch(`${endpoint}?${params}`, { mode: 'cors', credentials: 'omit', cache: 'default' });
    if (!response.ok) throw new Error(`Content request failed (${response.status})`);
    const data = await response.json();
    return Array.isArray(data.result) ? data.result : [];
  }

  async function fill(selector, types, kind, options = {}) {
    const container = document.querySelector(selector);
    if (!container) return;
    const items = await getItems(types);
    if (!items.length) return;
    container.replaceChildren(...items.map((item) => card(item, kind)));
    if (options.section) options.section.hidden = false;
  }

  fill('[data-content-list="articles"]', ['article'], 'articles').catch(() => {});
  fill('[data-content-list="videos"]', ['youtubeVideo', 'instagramReel'], 'videos', { section: document.querySelector('[data-content-section="videos"]') }).catch(() => {});
  fill('[data-content-list="physical-books"]', ['physicalBook'], 'bookshelf').catch(() => {});
  fill('[data-content-list="digital-products"]', ['digitalProduct'], 'bookshelf').catch(() => {});
  fill('[data-content-list="affiliates"]', ['affiliateProduct'], 'affiliates').catch(() => {});
})();
