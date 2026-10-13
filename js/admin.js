(() => {
  const link = document.querySelector('#studio-link');
  const studioUrl = window.TPB_CONFIG?.sanityStudioUrl;
  if (!link || !studioUrl) return;
  try {
    const url = new URL(studioUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.sanity.studio')) return;
    link.href = url.href;
  } catch { /* use the project dashboard until the Studio URL is configured */ }
})();
