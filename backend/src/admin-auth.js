import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from 'node:crypto';

const b64 = (value) => Buffer.from(value).toString('base64url');
const json = (value) => b64(JSON.stringify(value));

function equalText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function sign(secret, value) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function cookieMap(header = '') {
  return Object.fromEntries(header.split(';').map((piece) => piece.trim().split(/=(.*)/s).slice(0, 2)).filter(([key, value]) => key && value !== undefined));
}

function signedPayload(secret, payload) {
  const value = json(payload);
  return `${value}.${sign(secret, value)}`;
}

function readSignedPayload(secret, token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const [value, signature, extra] = token.split('.');
  if (!value || !signature || extra !== undefined || !equalText(sign(secret, value), signature)) return null;
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { return null; }
}

export function createAdminAuth(config, fetchImpl = fetch) {
  const adminSubjects = new Set(config.adminSubjects ?? []);
  let discoveryCache;
  let discoveryExpires = 0;
  let jwksCache;
  let jwksExpires = 0;
  const cookieName = config.production ? '__Host-tpb_admin' : 'tpb_admin';
  const stateCookieName = config.production ? '__Host-tpb_oidc' : 'tpb_oidc';
  const sessionCookiePath = config.production ? '/' : '/api/admin';
  const stateCookiePath = config.production ? '/' : '/api/admin/auth';
  const cookieSecure = config.production ? '; Secure' : '';

  if (!config.issuer || !config.clientId || !config.redirectUri || !config.adminUiUrl || !config.sessionSecret || Buffer.byteLength(config.sessionSecret) < 32 || adminSubjects.size === 0) {
    throw new Error('Admin OIDC requires OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_REDIRECT_URI, ADMIN_UI_URL, a 32-byte ADMIN_SESSION_SECRET, and OIDC_ADMIN_SUBJECTS.');
  }
  for (const [name, value] of [['OIDC_ISSUER', config.issuer], ['OIDC_REDIRECT_URI', config.redirectUri], ['ADMIN_UI_URL', config.adminUiUrl]]) {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error(`${name} must be an absolute URL.`); }
    if (parsed.protocol !== 'https:' && !(config.production === false && ['localhost', '127.0.0.1'].includes(parsed.hostname))) throw new Error(`${name} must use HTTPS.`);
  }

  async function discovery() {
    if (discoveryCache && discoveryExpires > Date.now()) return discoveryCache;
    const response = await fetchImpl(`${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, { redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('OIDC discovery failed.');
    const result = await response.json();
    if (result.issuer !== config.issuer || !result.authorization_endpoint || !result.token_endpoint || !result.jwks_uri) throw new Error('OIDC discovery document is invalid.');
    for (const endpoint of [result.authorization_endpoint, result.token_endpoint, result.jwks_uri]) {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== 'https:' && !(config.production === false && ['localhost', '127.0.0.1'].includes(parsed.hostname))) throw new Error('OIDC discovery endpoints must use HTTPS.');
    }
    discoveryCache = result;
    discoveryExpires = Date.now() + 5 * 60_000;
    return result;
  }

  async function jwks(uri, refresh = false) {
    if (!refresh && jwksCache && jwksExpires > Date.now()) return jwksCache;
    const response = await fetchImpl(uri, { redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('OIDC signing keys could not be loaded.');
    const result = await response.json();
    if (!Array.isArray(result.keys)) throw new Error('OIDC signing keys are invalid.');
    jwksCache = result.keys;
    jwksExpires = Date.now() + 5 * 60_000;
    return jwksCache;
  }

  async function verifyIdToken(token, nonce, provider) {
    if (typeof token !== 'string' || token.length > 16_384) throw new Error('OIDC identity token is invalid.');
    const [encodedHeader, encodedClaims, encodedSignature, extra] = token.split('.');
    if (!encodedHeader || !encodedClaims || !encodedSignature || extra !== undefined) throw new Error('OIDC identity token is invalid.');
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('OIDC identity token algorithm is unsupported.');
    let key = (await jwks(provider.jwks_uri)).find((item) => item.kid === header.kid && item.kty === 'RSA' && item.use !== 'enc');
    if (!key) key = (await jwks(provider.jwks_uri, true)).find((item) => item.kid === header.kid && item.kty === 'RSA' && item.use !== 'enc');
    if (!key || !verifySignature('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedClaims}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(encodedSignature, 'base64url'))) throw new Error('OIDC identity token signature is invalid.');
    const now = Math.floor(Date.now() / 1000);
    const audienceOk = claims.aud === config.clientId || Array.isArray(claims.aud) && claims.aud.includes(config.clientId);
    if (claims.iss !== config.issuer || !audienceOk || (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== config.clientId) || !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf && claims.nbf > now) || !equalText(claims.nonce, nonce) || typeof claims.sub !== 'string' || !claims.sub) throw new Error('OIDC identity token claims are invalid.');
    return claims;
  }

  function session(request) {
    const token = cookieMap(request.headers.cookie)[cookieName];
    const payload = readSignedPayload(config.sessionSecret, token);
    if (!payload || typeof payload.sub !== 'string' || !adminSubjects.has(payload.sub) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return { subject: payload.sub, expiresAt: payload.exp };
  }

  return {
    cookieName,
    session,
    async login(response) {
      const provider = await discovery();
      const state = randomBytes(32).toString('base64url');
      const nonce = randomBytes(32).toString('base64url');
      const verifier = randomBytes(32).toString('base64url');
      const authState = signedPayload(config.sessionSecret, { state, nonce, verifier, exp: Math.floor(Date.now() / 1000) + 600 });
      response.setHeader('set-cookie', `${stateCookieName}=${authState}; HttpOnly; SameSite=Lax; Path=${stateCookiePath}; Max-Age=600${cookieSecure}`);
      const url = new URL(provider.authorization_endpoint);
      url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
      response.writeHead(302, { location: url.href, 'cache-control': 'no-store' });
      response.end();
    },
    async callback(request, response, url) {
      const saved = readSignedPayload(config.sessionSecret, cookieMap(request.headers.cookie)[stateCookieName]);
      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      if (!saved || saved.exp <= Math.floor(Date.now() / 1000) || !state || !equalText(saved.state, state) || !code || url.searchParams.has('error')) throw new Error('Admin sign-in could not be verified. Start again.');
      const provider = await discovery();
      const responseFromProvider = await fetchImpl(provider.token_endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, code, redirect_uri: config.redirectUri, code_verifier: saved.verifier }),
      });
      if (!responseFromProvider.ok) throw new Error('Admin sign-in token exchange failed.');
      const tokenSet = await responseFromProvider.json();
      const claims = await verifyIdToken(tokenSet.id_token, saved.nonce, provider);
      if (!adminSubjects.has(claims.sub)) throw new Error('This identity is not authorized for the admin console.');
      const expires = Math.floor(Date.now() / 1000) + Math.min(8 * 60 * 60, Math.max(60, Number(tokenSet.expires_in) || 3600));
      response.setHeader('set-cookie', [
        `${cookieName}=${signedPayload(config.sessionSecret, { sub: claims.sub, exp: expires })}; HttpOnly; SameSite=Lax; Path=${sessionCookiePath}; Max-Age=${expires - Math.floor(Date.now() / 1000)}${cookieSecure}`,
        `${stateCookieName}=; HttpOnly; SameSite=Lax; Path=${stateCookiePath}; Max-Age=0${cookieSecure}`,
      ]);
      response.writeHead(302, { location: config.adminUiUrl, 'cache-control': 'no-store' });
      response.end();
    },
    logout(response) {
      response.setHeader('set-cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=${sessionCookiePath}; Max-Age=0${cookieSecure}`);
    },
  };
}
