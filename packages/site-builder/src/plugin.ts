import type { PluginDescriptor } from 'emdash';

/** Only serializable metadata is evaluated while Astro loads its configuration. */
export function siteBuilder(): PluginDescriptor {
  return {
    id: 'site-builder', version: '0.1.0', format: 'native',
    entrypoint: '@open-emdash/site-builder/runtime',
    adminEntry: '@open-emdash/site-builder/admin',
  };
}
