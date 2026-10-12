import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('正式游戏名称', () => {
  it('浏览器标签、大厅与结算使用肘击大乱斗', () => {
    expect(source('../../index.html')).toContain('<title>肘击大乱斗 · Elbow Mayhem</title>');
    expect(source('./main.tsx')).toContain('<h1>肘击大乱斗</h1>');
    expect(source('./ResultDialog.tsx')).toContain('肘击大乱斗 · 本局结束');
    for (const path of ['../../index.html', './main.tsx', './ResultDialog.tsx']) expect(source(path)).not.toContain('损友大乱斗');
  });
  it('现行说明文档使用正式名称且只列一张正式卡', () => {
    for (const path of ['../../README.md', '../../GAME_RULES.md']) {
      expect(source(path)).toContain('肘击大乱斗');
      expect(source(path)).toContain('Elbow Mayhem');
      expect(source(path)).toContain('牢大肘击');
      expect(source(path)).not.toContain('损友大乱斗');
    }
  });
});
