import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PhotoSwipe viewer assets', () => {
  it('pins and self-hosts the viewer library through Workers static assets', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const wranglerConfig = JSON.parse(readFileSync('wrangler.example.jsonc', 'utf8')) as {
      assets?: { directory?: string };
    };

    expect(packageJson.dependencies?.photoswipe).toBe('5.4.4');
    expect(wranglerConfig.assets?.directory).toBe('./public');

    for (const path of [
      'public/vendor/photoswipe/photoswipe.css',
      'public/vendor/photoswipe/photoswipe.esm.js',
      'public/vendor/photoswipe/photoswipe-lightbox.esm.js',
      'public/vendor/photoswipe/LICENSE',
    ]) {
      expect(statSync(path).size).toBeGreaterThan(100);
    }
  });
});
