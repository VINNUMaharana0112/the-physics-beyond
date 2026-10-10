const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateOrderInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request body.' };
  const { productId, quantity, email, shippingAddress } = body;
  if (typeof productId !== 'string' || !/^[0-9a-f-]{36}$/i.test(productId)) return { error: 'A valid productId is required.' };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return { error: 'Quantity must be an integer from 1 to 10.' };
  if (typeof email !== 'string' || email.length > 254 || !EMAIL.test(email)) return { error: 'A valid email address is required.' };
  if (shippingAddress !== undefined) {
    if (!shippingAddress || typeof shippingAddress !== 'object' || Array.isArray(shippingAddress)) return { error: 'shippingAddress must be an object.' };
    const fields = ['name', 'line1', 'city', 'state', 'postalCode', 'country'];
    for (const field of fields) {
      if (typeof shippingAddress[field] !== 'string' || shippingAddress[field].trim().length < 1 || shippingAddress[field].length > 160) {
        return { error: `shippingAddress.${field} is required and must be at most 160 characters.` };
      }
    }
    if (Object.keys(shippingAddress).some((key) => !fields.includes(key))) return { error: 'shippingAddress contains an unsupported field.' };
  }
  return { value: { productId, quantity, email: email.trim().toLowerCase(), shippingAddress: shippingAddress ?? null } };
}

export function isValidUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
