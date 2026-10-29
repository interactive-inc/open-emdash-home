type Props = { url: string };

/** Allow same-origin styles in development while leaving scripts and forms disabled. */
export function PagePreviewFrame(props: Props) {
  return <iframe
    title="ページの下書きプレビュー"
    src={props.url}
    sandbox="allow-same-origin"
    referrerPolicy="no-referrer"
    style={{ display: 'block', width: '100%', height: '70vh', minHeight: 480, border: '1px solid var(--color-kumo-line, #d1d5db)', borderRadius: 8, background: '#fff' }}
  />;
}
