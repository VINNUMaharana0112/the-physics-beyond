import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { createAdminAuth } from '../src/admin-auth.js';

const config = {
  issuer: 'https://identity.example', clientId: 'commerce-admin',
  redirectUri: 'https://api.example.test/api/admin/auth/callback', adminUiUrl: 'https://shop.example.test/admin/',
  sessionSecret: Buffer.alloc(32, 9).toString('base64url'), adminSubjects: ['operator-1'], production: true,
};

function signToken(privateKey, claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: 'test-key-1' });
  const payload = encode(claims);
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey).toString('base64url')}`;
}

function responseMock() {
  return { headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))); }, end() {} };
}

test('OIDC admin sign-in uses state, PKCE, a signed session cookie, and a subject allowlist', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key-1', use: 'sig', alg: 'RS256' };
  let claims;
  const fetchImpl = async (url, options = {}) => {
    if (url === 'https://identity.example/.well-known/openid-configuration') return { ok: true, async json() { return { issuer: config.issuer, authorization_endpoint: 'https://identity.example/authorize', token_endpoint: 'https://identity.example/token', jwks_uri: 'https://identity.example/jwks' }; } };
    if (url === 'https://identity.example/jwks') return { ok: true, async json() { return { keys: [jwk] }; } };
    if (url === 'https://identity.example/token') {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.equal(body.get('code_verifier').length, 43);
      return { ok: true, async json() { return { expires_in: 3600, id_token: signToken(privateKey, claims) }; } };
    }
    throw new Error(`Unexpected identity provider URL: ${url}`);
  };
  const auth = createAdminAuth(config, fetchImpl);
  const loginResponse = responseMock();
  await auth.login(loginResponse);
  const authorize = new URL(loginResponse.headers.location);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authorize.searchParams.get('code_challenge'));
  const stateCookie = loginResponse.headers['set-cookie'].split(';')[0];
  claims = { iss: config.issuer, aud: config.clientId, sub: 'operator-1', nonce: authorize.searchParams.get('nonce'), exp: Math.floor(Date.now() / 1000) + 300 };
  const callbackResponse = responseMock();
  const callbackUrl = new URL(`${config.redirectUri}?code=valid-code&state=${encodeURIComponent(authorize.searchParams.get('state'))}`);
  await auth.callback({ headers: { cookie: stateCookie } }, callbackResponse, callbackUrl);
  assert.equal(callbackResponse.status, 302);
  assert.equal(callbackResponse.headers.location, config.adminUiUrl);
  const cookies = callbackResponse.headers['set-cookie'];
  const sessionCookie = cookies.find((value) => value.startsWith('__Host-tpb_admin=')).split(';')[0];
  assert.match(cookies[0], /HttpOnly; SameSite=Lax; Path=\/;.*Secure/);
  assert.equal(auth.session({ headers: { cookie: sessionCookie } }).subject, 'operator-1');
  assert.equal(auth.session({ headers: { cookie: '__Host-tpb_admin=forged' } }), null);

  claims = { ...claims, sub: 'unapproved-operator' };
  const deniedResponse = responseMock();
  await assert.rejects(auth.callback({ headers: { cookie: stateCookie } }, deniedResponse, callbackUrl), /not authorized/);
});

test('admin OIDC refuses to start without configured identity and session secrets', () => {
  assert.throws(() => createAdminAuth({}), /Admin OIDC requires/);
});
