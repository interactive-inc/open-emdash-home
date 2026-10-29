import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';

/** Opt-in routes let the host use the packaged renderer without copying page code. */
export function siteBuilderPages(): AstroIntegration {
  return {
    name: '@open-emdash/site-builder/pages',
    hooks: {
      'astro:config:setup': setup => {
        setup.updateConfig({ vite: { ssr: { noExternal: ['@open-emdash/site-builder'] } } });
        setup.addMiddleware({ entrypoint: '@open-emdash/site-builder/middleware', order: 'post' });
        setup.injectRoute({
          pattern: '/[...slug]',
          entrypoint: fileURLToPath(new URL('../src/pages/[...slug].astro', import.meta.url)),
          prerender: false,
        });
        setup.injectRoute({
          pattern: '/preview/[id]',
          entrypoint: fileURLToPath(new URL('../src/pages/preview/[id].astro', import.meta.url)),
          prerender: false,
        });
      },
    },
  };
}
