import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { getEditorPageId } from './get-editor-page-id.ts';
import { getPagePreview } from './get-page-preview.ts';
import { PagePreviewFrame } from './page-preview-frame.tsx';

type Props = { value: unknown };

/** Replace the internal document field with a saved-draft preview, using host contexts. */
export function PagePreviewField(props: Props) {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const pageId = getEditorPageId(pathname);
  const preview = useQuery({
    queryKey: ['site-builder', 'page-preview', pageId, props.value],
    queryFn: context => getPagePreview(pageId ?? '', context.signal),
    enabled: pageId !== null, staleTime: 0, gcTime: 0, retry: false,
  });

  if (pageId === null) return <p>ページの作成・変更はチャットで行ってください。保存したページを開くと、ここで確認して公開できます。</p>;

  return <section aria-label="ページプレビュー" style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <p>プレビューを確認して、公開できます。</p>
      <button type="button" className="rounded-md border px-3 py-2 text-sm" disabled={preview.isFetching} onClick={() => void preview.refetch()}>プレビューを更新</button>
    </div>
    <p className="text-sm text-kumo-subtle">変更はチャットで伝えてください。保存後にプレビューを更新できます。</p>
    {preview.isFetching && <p role="status">プレビューを読み込んでいます…</p>}
    {preview.error && <p role="alert">{preview.error.message}</p>}
    {!preview.isFetching && preview.data && <>
      <a href={preview.data} target="_blank" rel="noreferrer" className="text-sm underline">別画面で確認 ↗</a>
      <PagePreviewFrame url={preview.data} />
    </>}
  </section>;
}
