(() => {
  const { sanityProjectId: projectId, sanityDataset: dataset = 'production', sanityApiVersion: apiVersion = '2025-01-01' } = window.TPB_CONFIG || {};
  const root = document.querySelector('#content-entry');
  const slug = new URLSearchParams(window.location.search).get('slug');
  if (!root || !slug) return;
  if (!/^[a-z0-9-]+$/.test(projectId || '')) return unavailable('The publishing studio has not been connected yet.');
  const query = `*[_type in $types && slug.current == $slug && !(_id in path("drafts.**"))][0]{_id,_type,title,"slug":slug.current,description,category,author,publishedAt,body[]{...,_type == "image" => {"url":asset->url,alt}},platformUrl,caption,format,priceDisplay,availability,publisher,shippingDetails,deliveryEstimate,whatIsIncluded,isFree,freeDownloadUrl,deliveryDetails,purchaseUrl,affiliateUrl,disclosure,"imageUrl":image.asset->url,"imageAlt":image.alt}`;
  const types = ['article', 'youtubeVideo', 'instagramReel', 'physicalBook', 'digitalProduct', 'affiliateProduct'];

  function node(tag, text, className) {
    const result = document.createElement(tag);
    if (text) result.textContent = text;
    if (className) result.className = className;
    return result;
  }
  function validUrl(value) {
    try {
      if (typeof value === 'string' && value.startsWith('mailto:')) return value;
      const url = new URL(value, window.location.origin);
      return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost') ? url.href : '';
    } catch { return ''; }
  }
  function addLink(text, value, className, sponsored = false, download = false) {
    const href = validUrl(value);
    if (!href) return;
    const link = node('a', text, className);
    link.href = href;
    if (!href.startsWith('mailto:') && new URL(href).origin !== window.location.origin) {
      link.target = '_blank';
      link.rel = sponsored ? 'sponsored nofollow noopener noreferrer' : 'noopener noreferrer';
    }
    if (download) link.download = '';
    root.append(link);
  }
  function unavailable(message = 'This item is not available.') {
    root.replaceChildren(node('h1', 'This content is not available.'), node('p', message));
  }
  function appendTextBlock(block) {
    const tag = ({ h2: 'h2', h3: 'h3', blockquote: 'blockquote' })[block.style] || 'p';
    const target = node(tag);
    for (const span of (block.children || [])) {
      if (span._type !== 'span') continue;
      let piece = node('span', span.text || '');
      for (const mark of span.marks || []) {
        const definition = (block.markDefs || []).find((entry) => entry._key === mark);
        let wrapper;
        if (definition?._type === 'link' && validUrl(definition.href)) {
          wrapper = node('a'); wrapper.href = validUrl(definition.href); wrapper.rel = 'noopener noreferrer';
        } else if (mark === 'strong') wrapper = node('strong');
        else if (mark === 'em') wrapper = node('em');
        if (wrapper) { wrapper.append(piece); piece = wrapper; }
      }
      target.append(piece);
    }
    root.append(target);
  }
  function renderArticleBody(body) {
    let activeList = null;
    for (const block of body || []) {
      if (block._type === 'image') {
        activeList = null;
        const src = validUrl(block.url);
        if (src) { const image = node('img'); image.src = src; image.alt = block.alt || ''; image.loading = 'lazy'; image.className = 'content-feature-image'; root.append(image); }
        continue;
      }
      if (block._type !== 'block') continue;
      if (block.listItem === 'bullet' || block.listItem === 'number') {
        const tag = block.listItem === 'bullet' ? 'ul' : 'ol';
        if (!activeList || activeList.tagName.toLowerCase() !== tag) { activeList = node(tag); root.append(activeList); }
        const savedRoot = root;
        const item = node('li');
        for (const span of (block.children || [])) item.append(node('span', span.text || ''));
        activeList.append(item);
        void savedRoot;
      } else { activeList = null; appendTextBlock(block); }
    }
  }
  function render(item) {
    root.replaceChildren();
    root.append(node('p', item.category || 'THE PHYSICS BEYOND', 'eyebrow'));
    root.append(node('h1', item.title));
    if (item.description) root.append(node('p', item.description, 'hero-description'));
    if (item.author) root.append(node('p', `By ${item.author}`));
    if (item.imageUrl && validUrl(item.imageUrl)) { const image = node('img'); image.src = validUrl(item.imageUrl); image.alt = item.imageAlt || item.title; image.loading = 'eager'; image.className = 'content-feature-image'; root.append(image); }

    if (item._type === 'article') renderArticleBody(item.body);
    if (item._type === 'youtubeVideo' || item._type === 'instagramReel') {
      if (item.caption) root.append(node('p', item.caption));
      addLink(item._type === 'instagramReel' ? 'Watch on Instagram' : 'Watch on YouTube', item.platformUrl, 'btn btn-primary');
    }
    if (item._type === 'physicalBook') {
      const details = [item.publisher && `Publisher: ${item.publisher}`, item.format && `Format: ${item.format}`, item.priceDisplay && `Price: ${item.priceDisplay}`, item.availability && `Availability: ${item.availability}`, item.shippingDetails && `Shipping: ${item.shippingDetails}`, item.deliveryEstimate && `Delivery: ${item.deliveryEstimate}`, item.whatIsIncluded && `Includes: ${item.whatIsIncluded}`].filter(Boolean);
      for (const detail of details) root.append(node('p', detail));
      if (item.purchaseUrl) addLink('Continue to book details / order', item.purchaseUrl, 'btn btn-primary');
      else addLink('Enquire about this book', `mailto:thephysicsbeyond@gmail.com?subject=${encodeURIComponent(`Question about ${item.title}`)}`, 'btn btn-primary');
    }
    if (item._type === 'digitalProduct') {
      for (const detail of [item.format && `Format: ${item.format}`, item.priceDisplay && `Price: ${item.priceDisplay}`, item.whatIsIncluded, item.deliveryDetails].filter(Boolean)) root.append(node('p', detail));
      if (item.isFree && item.freeDownloadUrl) addLink('Download free resource', item.freeDownloadUrl, 'btn btn-primary', false, true);
      else if (item.purchaseUrl) addLink('Continue to product / checkout', item.purchaseUrl, 'btn btn-primary');
      else root.append(node('p', item.availability || 'More details will be added soon.'));
    }
    if (item._type === 'affiliateProduct') {
      if (item.disclosure) root.append(node('p', item.disclosure, 'purchase-note'));
      addLink('View this product at the retailer', item.affiliateUrl, 'btn btn-primary', true);
    }
    document.title = `${item.title} | The Physics Beyond`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', item.description || 'Explore The Physics Beyond.');
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://thephysicsbeyond.com/entry/?slug=${encodeURIComponent(item.slug)}`);
  }

  const params = new URLSearchParams({ query, '$types': JSON.stringify(types), '$slug': JSON.stringify(slug) });
  fetch(`https://${projectId}.apicdn.sanity.io/v${apiVersion}/data/query/${encodeURIComponent(dataset)}?${params}`, { mode: 'cors', credentials: 'omit' })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('Content could not be loaded.')))
    .then(({ result }) => result ? render(result) : unavailable('It may be a draft or the link may be incorrect.'))
    .catch(() => unavailable('Please check back soon.'));
})();
