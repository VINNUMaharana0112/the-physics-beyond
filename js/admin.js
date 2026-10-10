(() => {
  const apiBase = document.querySelector('meta[name="commerce-api-base"]')?.content.trim().replace(/\/+$/, '');
  const status = document.querySelector('#admin-status');
  const signIn = document.querySelector('#sign-in');
  const signOut = document.querySelector('#sign-out');
  const app = document.querySelector('#admin-app');
  const productForm = document.querySelector('#product-form');
  const fileForm = document.querySelector('#file-form');
  const affiliateForm = document.querySelector('#affiliate-form');

  if (!apiBase) {
    status.textContent = 'Set the commerce-api-base meta value to the deployed HTTPS commerce API origin before publishing this admin page.';
    return;
  }
  let api;
  try {
    api = new URL(apiBase);
    if (api.protocol !== 'https:' && api.hostname !== 'localhost' && api.hostname !== '127.0.0.1') throw new Error();
  } catch {
    status.textContent = 'The configured commerce API address must use HTTPS.';
    return;
  }

  const call = async (path, options = {}) => {
    const response = await fetch(`${apiBase}${path}`, { credentials: 'include', cache: 'no-store', ...options });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  };
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (label, action) => {
    const node = el('button', label, 'btn btn-secondary');
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  };
  const setStatus = (message) => { status.textContent = message; };
  const formValue = (form, name) => form.elements.namedItem(name).value;
  const checked = (form, name) => form.elements.namedItem(name).checked;
  const formatPrice = (amount, currency) => {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amount) / 100); }
    catch { return `${currency} ${amount} minor units`; }
  };
  const setField = (form, name, value) => {
    const field = form.elements.namedItem(name);
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value ?? '';
  };

  async function loadProducts() {
    const { products } = await call('/api/admin/products');
    const list = document.querySelector('#products-list');
    list.replaceChildren();
    for (const product of products) {
      const card = el('article', undefined, 'admin-item');
      card.append(el('strong', `${product.title} · ${product.slug}`));
      card.append(el('p', `${product.kind} · ${formatPrice(product.priceMinor, product.currency)} · ${product.active ? 'active' : 'inactive'} · stock ${product.stock ?? 'unlimited'}`));
      card.append(el('p', `Price confirmed: ${product.priceConfirmed}; fulfilment ready: ${product.fulfillmentReady}; Payment Link: ${product.paymentLinkEnabled}`));
      if (product.fileName) card.append(el('p', `Private file: ${product.fileName}`));
      card.append(button('Edit', () => {
        for (const key of ['id', 'slug', 'title', 'description', 'kind', 'priceMinor', 'currency', 'stock', 'active', 'paymentLinkEnabled', 'priceConfirmed', 'fulfillmentReady']) setField(productForm, key, product[key]);
        fileForm.hidden = product.kind !== 'digital_download';
        fileForm.dataset.productId = product.id;
        productForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
      card.append(button('Delete', async () => {
        try { await call(`/api/admin/products/${product.id}`, { method: 'DELETE' }); await refresh(); setStatus('Product deleted.'); }
        catch (error) { setStatus(error.message); }
      }));
      list.append(card);
    }
  }

  async function loadOrders() {
    const { orders } = await call('/api/admin/orders');
    const list = document.querySelector('#orders-list');
    list.replaceChildren();
    for (const order of orders) {
      const card = el('article', undefined, 'admin-item');
      card.append(el('strong', `${order.productTitle} · ${order.status} / ${order.fulfillmentStatus}`));
      card.append(el('p', `${order.customerEmail} · ${order.quantity} × ${formatPrice(order.amountMinor, order.currency)}`));
      if (order.shippingAddress) card.append(el('p', `Ship to: ${Object.values(order.shippingAddress).join(', ')}`));
      if (order.trackingReference) card.append(el('p', `Tracking: ${order.trackingReference}`));
      card.append(el('p', `Order ${order.id} · created ${new Date(order.createdAt).toLocaleString()}`));
      if (order.status === 'paid' && order.kind === 'physical_book') {
        const next = { unfulfilled: 'processing', processing: 'shipped', shipped: 'delivered' }[order.fulfillmentStatus];
        if (next) {
          const tracking = document.createElement('input');
          tracking.type = 'text';
          tracking.maxLength = 200;
          tracking.placeholder = next === 'shipped' ? 'Shipping reference (required)' : 'Tracking reference (optional)';
          tracking.setAttribute('aria-label', 'Shipping reference');
          card.append(tracking);
          card.append(button(`Mark ${next}`, async () => {
            try {
              await call(`/api/admin/orders/${order.id}/fulfillment`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: next, trackingReference: tracking.value }) });
              await loadOrders(); setStatus('Order fulfilment updated.');
            } catch (error) { setStatus(error.message); }
          }));
        }
      }
      if (order.status === 'paid' && order.kind === 'digital_download') {
        const expiry = document.createElement('input'); expiry.type = 'datetime-local'; expiry.setAttribute('aria-label', 'Download link expiry');
        const limit = document.createElement('input'); limit.type = 'number'; limit.min = '1'; limit.max = '100'; limit.placeholder = 'Download limit'; limit.setAttribute('aria-label', 'Download limit');
        card.append(el('p', 'Choose an expiry and download limit before issuing a link. The raw link is shown once and must be sent to the buyer through your approved private channel.'));
        card.append(expiry, limit);
        card.append(button('Issue download grant', async () => {
          try {
            if (!expiry.value || !limit.value) throw new Error('Choose the link expiry and download limit.');
            const { downloadUrl, expiresAt } = await call(`/api/admin/orders/${order.id}/download-grant`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresAt: new Date(expiry.value).toISOString(), maxDownloads: Number(limit.value) }) });
            const link = document.createElement('input'); link.readOnly = true; link.value = downloadUrl; link.setAttribute('aria-label', 'One-time displayed buyer download URL');
            const expiryNote = el('p', `Link expires ${new Date(expiresAt).toLocaleString()}. Keep it private.`);
            card.append(link, expiryNote); setStatus('Download grant created. Copy the link now; it is not stored in readable form.');
          } catch (error) { setStatus(error.message); }
        }));
      }
      list.append(card);
    }
  }

  async function loadAffiliates() {
    const { affiliates } = await call('/api/admin/affiliates');
    const list = document.querySelector('#affiliates-list');
    list.replaceChildren();
    for (const affiliate of affiliates) {
      const card = el('article', undefined, 'admin-item');
      card.append(el('strong', `${affiliate.title} · ${affiliate.active ? 'public' : 'inactive'}`));
      card.append(el('p', `${affiliate.publisher} · ${affiliate.url}`));
      card.append(el('p', affiliate.disclosure));
      card.append(button('Edit', () => {
        for (const [key, value] of Object.entries(affiliate)) setField(affiliateForm, key, value);
        affiliateForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
      card.append(button('Delete', async () => {
        try { await call(`/api/admin/affiliates/${affiliate.id}`, { method: 'DELETE' }); await refresh(); setStatus('Affiliate offer deleted.'); }
        catch (error) { setStatus(error.message); }
      }));
      list.append(card);
    }
  }

  async function refresh() { await Promise.all([loadProducts(), loadOrders(), loadAffiliates()]); }

  productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = formValue(productForm, 'id');
    const product = {
      slug: formValue(productForm, 'slug'), title: formValue(productForm, 'title'), description: formValue(productForm, 'description'),
      kind: formValue(productForm, 'kind'), priceMinor: Number(formValue(productForm, 'priceMinor')), currency: formValue(productForm, 'currency'),
      stock: formValue(productForm, 'stock') === '' ? null : Number(formValue(productForm, 'stock')), active: checked(productForm, 'active'),
      paymentLinkEnabled: checked(productForm, 'paymentLinkEnabled'), priceConfirmed: checked(productForm, 'priceConfirmed'), fulfillmentReady: checked(productForm, 'fulfillmentReady'),
    };
    try {
      const result = await call(id ? `/api/admin/products/${id}` : '/api/admin/products', { method: id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(product) });
      const savedId = id || result.product?.id;
      setStatus('Product saved.'); await refresh();
      if (!id && savedId) setField(productForm, 'id', savedId);
      if (product.kind === 'digital_download') { fileForm.hidden = false; fileForm.dataset.productId = savedId || ''; }
    } catch (error) { setStatus(error.message); }
  });

  document.querySelector('#new-product').addEventListener('click', () => {
    productForm.reset(); setField(productForm, 'id', ''); setField(productForm, 'currency', 'INR'); fileForm.hidden = true;
  });

  fileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileForm.elements.namedItem('file').files[0];
    const id = fileForm.dataset.productId;
    if (!file || !id) { setStatus('Save the digital product before uploading its file.'); return; }
    try {
      const response = await fetch(`${apiBase}/api/admin/products/${id}/file`, { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, body: file });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Private file upload failed.');
      setStatus('File stored privately.'); await refresh();
    } catch (error) { setStatus(error.message); }
  });

  affiliateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = formValue(affiliateForm, 'id');
    const affiliate = { title: formValue(affiliateForm, 'title'), publisher: formValue(affiliateForm, 'publisher'), url: formValue(affiliateForm, 'url'), disclosure: formValue(affiliateForm, 'disclosure'), active: checked(affiliateForm, 'active') };
    try { await call(id ? `/api/admin/affiliates/${id}` : '/api/admin/affiliates', { method: id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(affiliate) }); await refresh(); setStatus('Affiliate offer saved.'); }
    catch (error) { setStatus(error.message); }
  });
  document.querySelector('#new-affiliate').addEventListener('click', () => affiliateForm.reset());
  signOut.addEventListener('click', async () => {
    try { await call('/api/admin/auth/logout', { method: 'POST' }); window.location.reload(); }
    catch (error) { setStatus(error.message); }
  });

  call('/api/admin/session').then(async () => {
    signOut.hidden = false; app.hidden = false; setStatus('Signed in.'); await refresh();
  }).catch(() => {
    signIn.href = `${apiBase}/api/admin/auth/login`;
    signIn.hidden = false;
    setStatus('Sign in is required to manage the store.');
  });
})();
