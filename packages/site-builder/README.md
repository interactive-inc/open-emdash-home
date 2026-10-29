# @open-emdash/site-builder

EmDashの認証・コンテンツ管理・公開管理を使い、MCPからjson-renderのページを作るネイティブプラグインです。
公開ページと管理画面内のプレビューを、同じAstro + Reactの描画処理で表示します。

## 導入

npmにはまだ公開していません。現在のサンプルは`workspace:*`でプラグインを参照します。
npm公開後は、EmDashプロジェクトへ`vp add @open-emdash/site-builder`で組み込める構成です。
通常の開発に圧縮ファイルは不要です。別プロジェクトへの導入検証時だけ、一時フォルダー内で生成・利用します。

現在の対応対象はAstro 7.4.2、EmDash 1.3.1、React/React DOM 19.2.4以降の19系です。
既存ホストに`@astrojs/react`の登録とEmDashのlive collection設定が必要です。

EmDashとCloudflareツールが固定している間接依存の修正版を使うため、このリポジトリでは`pnpm-workspace.yaml`にZod 4.6.7 / undici 7.30.1のoverridesを指定しています。別ホストへの導入時も同等の設定と依存監査が必要です。パッケージのインストールだけではホスト側の間接依存は置き換わりません。

```js
// astro.config.mjs — 既存のadapter、database、storage設定を維持する
import { siteBuilder } from '@open-emdash/site-builder';
import { siteBuilderPages } from '@open-emdash/site-builder/astro';

// integrationsにsiteBuilderPages()を追加
// emdash({ ...既存設定, plugins: [...既存プラグイン, siteBuilder()] })
```

`siteBuilderPages()`は`/[...slug]`と`/preview/[id]`を登録し、描画・CSS・プレビュー・レスポンス保護を提供します。
ルート全体をこのビルダーで表示したい場合に明示的に追加します。既存のcatch-allルートがあるサイトでは両方を登録せず、公開ページの所有範囲を先に決めてください。
ホストが設定したCSPなどのレスポンスヘッダーは上書きしません。

このバージョンは`pages`コレクションの`document`フィールドを使います。
既存のEmDashサイトの`pages`が通常の記事ページとして使われている場合、そのまま有効化しないでください。`pages`の保存・公開にページJSONの検証が適用されます。
自動で既存スキーマやコンテンツを書き換える処理はありません。

初期構成に必要なフィールド:

- `title`: string、必須
- `description`: text
- `document`: json、必須、widget: `site-builder:page-preview`
- supports: `drafts`, `revisions`, `preview`。URL pattern: `/{slug}`

`slug: "home"`がトップページです。ほかは`/{slug}`になります。
これらのフィールドはEmDashの管理画面または標準MCPのスキーマ操作で用意できます。既存DBへサンプルコンテンツを一括投入する必要はありません。

`document.widget`に`site-builder:page-preview`を指定すると、EmDash標準のフィールド拡張でJSON入力欄を大きなプレビューに置き換えます。`title`と`description`には`site-builder:managed`を指定し、チャットで管理する値を通常画面の入力欄から隠せます。保存データ・検証・APIからの更新は維持されます。既存サイトでは標準のフィールド更新APIでwidgetだけを設定してください。
ページを開くと保存済み下書きを自動表示し、変更後は「プレビューを更新」で確認します。公開はEmDash標準の公開ボタンを使います。Site Studioとサイドパネルは追加しません。
管理画面の取得・ルーティングには、EmDash 1.3.1と同じバージョンのTanStack Query / Routerを使用します。移植可能なプラグインとしてホストの別名設定に依存しない相対importと標準HTML操作部品を使います。

## 認証とプレビュー

- EmDash標準のユーザー・ロール・セッションとMCP OAuthを使用します。
- プロセスの環境変数`EMDASH_PREVIEW_SECRET`に安定した署名キーを設定してください。EmDash本体とプラグインで同じキーを使います。
- このキーは設定ファイルやブラウザーへ渡しません。ホスト固有の`astro:env`スキーマ宣言も不要です。
- ページ編集画面のプレビューは、保存済み下書きが対象です。JSONと内部メタデータを直接編集する欄は表示しません。
- 署名付きリンクは15分有効で対象の1ページだけを許可します。別記事の下書きへのアクセス権は付与しません。
- EmDash管理画面のPluginsで、Site BuilderのMCPツールを有効にしてください。MCPクライアントには必要な`content:*`と`mcp:tools:site-builder`のスコープを許可します。

## 公開エントリ

| import | 用途 |
| --- | --- |
| `@open-emdash/site-builder` | `siteBuilder()`をEmDashのpluginsへ登録 |
| `@open-emdash/site-builder/astro` | `siteBuilderPages()`で公開・プレビュールートを追加 |
| `@open-emdash/site-builder/catalog` | 部品カタログ・JSON仕様・MCP向けガイド |
| `@open-emdash/site-builder/document` | ページJSONの型・検証 |
| `@open-emdash/site-builder/renderer` | `SiteRenderer`を独自ページから使用 |
| `@open-emdash/site-builder/server` | `pageResponse()`で公開/下書きルールに従ってページを解決 |
| `@open-emdash/site-builder/PageShell.astro` | 完全なHTMLページの標準表示 |
| `@open-emdash/site-builder/styles.css` | 独自の表示で標準CSSだけを利用 |

`runtime`、`admin`、`middleware`も公開パスとして存在しますが、EmDash/Astroが読み込むための入口です。
サーバー用の入口はJavaScriptと型定義をビルドして配布し、React/Astro/CSSはホストのビルドで処理するソースとして配布します。
配布するソース内は相対importを維持し、ホスト固有の`@/`エイリアスには依存しません。

現在は登録済み12種類の部品を使用します。独自部品の登録APIや、別コレクション・別URL配下への設定は今後の拡張です。
npmへの公開、ライセンスの選定、対応バージョン範囲の拡大はまだ行っていません。
