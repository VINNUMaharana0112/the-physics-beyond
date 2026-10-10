(() => {
  const base = document.querySelector('meta[name="commerce-api-base"]')?.content.trim().replace(/\/+$/, '');
  if (!base) return;
  let api;
  try {
    api = new URL(base);
    if (api.protocol !== 'https:' && api.hostname !== 'localhost' && api.hostname !== '127.0.0.1') return;
  } catch { return; }

  fetch(`${base}/api/affiliates`, { credentials: 'omit', cache: 'no-store' })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('Affiliate catalogue unavailable.')))
    .then(({ affiliates = [] }) => {
      if (!Array.isArray(affiliates)) return;
      const grid = document.querySelector('#affiliate-recommendations .card-grid');
      if (!grid) return;
      const cards = affiliates.map((offer) => {
        if (!offer || typeof offer.title !== 'string' || typeof offer.publisher !== 'string' || typeof offer.disclosure !== 'string') return null;
        let destination;
        try { destination = new URL(offer.url); } catch { return null; }
        if (destination.protocol !== 'https:') return null;
        const card = document.createElement('article');
        card.className = 'topic-card';
        const title = document.createElement('h3');
        title.textContent = offer.title;
        const publisher = document.createElement('p');
        publisher.textContent = offer.publisher;
        const disclosure = document.createElement('p');
        disclosure.className = 'purchase-note';
        disclosure.textContent = offer.disclosure;
        const link = document.createElement('a');
        link.className = 'text-link';
        link.href = destination.href;
        link.target = '_blank';
        link.rel = 'sponsored nofollow noopener noreferrer';
        link.textContent = 'View retailer offer (affiliate link)';
        card.append(title, publisher, disclosure, link);
        return card;
      }).filter(Boolean);
      grid.replaceChildren(...cards);
    })
    .catch(() => { /* Preserve the verified static recommendations when the API is unavailable. */ });
})();
