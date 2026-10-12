import { describe, expect, it } from 'vitest';
import { nextRequestId } from './request-id';

describe('远程 HTTP 客户端的操作请求 ID', () => {
  it('在 randomUUID 不可用时仍可生成唯一且服务端可接受的 ID', () => {
    const insecureContextCrypto = { getRandomValues: <T extends ArrayBufferView>(array: T): T => {
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(7);
      return array;
    } };
    const first = nextRequestId(insecureContextCrypto);
    const second = nextRequestId(insecureContextCrypto);
    expect(first).toMatch(/^[0-9a-f-]{8,100}$/);
    expect(second).not.toBe(first);
  });
  it('没有 Web Crypto 时仍可提交幂等请求', () => {
    expect(nextRequestId(null)).toMatch(/^[0-9a-f-]{8,100}$/);
  });
});
