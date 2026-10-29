import { z } from 'zod';

const previewResponse = z.object({ success: z.literal(true), data: z.object({ url: z.string().startsWith('/preview/') }) });

/** Only the authenticated EmDash route can issue the page-scoped preview token. */
export const getPagePreview = async (id: string, signal: AbortSignal): Promise<string> => {
  const response = await fetch('/_emdash/api/plugins/site-builder/preview', {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json', 'X-EmDash-Request': '1' },
    body: JSON.stringify({ id }),
  });
  const parsed = previewResponse.safeParse(await response.json());

  if (!response.ok || !parsed.success) throw new Error('プレビューを読み込めませんでした。もう一度お試しください。');

  return parsed.data.data.url;
};
