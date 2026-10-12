let sequence = 0;

type RandomSource = Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>>;

// randomUUID() is absent in many HTTP LAN contexts. Request IDs are for
// idempotency, not authentication; the session token remains separate.
export function nextRequestId(source: Partial<RandomSource> | null = globalThis.crypto): string {
  if (typeof source?.randomUUID === 'function') return source.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof source?.getRandomValues === 'function') source.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  sequence = (sequence + 1) >>> 0;
  return `${Date.now().toString(16)}-${sequence.toString(16)}-${hex}`;
}
