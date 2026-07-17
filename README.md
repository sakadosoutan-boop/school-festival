# まちたいむ — 文化祭ガイド / 待ち時間アプリ

2026年8月29日（土）・8月30日（日）の文化祭で、来場者と生徒が企画一覧、待ち時間、タイムテーブルを確認するためのPWAです。添付されたプロトタイプの「待ち時間自動算出」「情報鮮度表示」「ブース単位更新」「誤操作に強い運用」を引き継ぎ、実運用向けに共有API、CSV/JSON取込、競合検知、オフライン表示、バックアップ、運用文書を追加しています。

## 主な機能

- 来場者向け：日付切替、企画検索（ひらがな/カタカナ/全角半角を同一視）、カテゴリ絞込、並び替え（おすすめ／待ち時間が短い順／名前順）、お気に入り、待ち時間（10分超は5分刻み表示）、待ち時間の推移グラフ、情報鮮度、タイムテーブル、開催中／次の演目表示
- スタッフ向け：PINログイン（更新用／管理者の2種）、列人数更新、案内完了、営業状態、売切・受付終了、お知らせ更新、終了時刻超過の警告
- 管理者向け：CSV/JSON取込、テンプレート出力、取込前検証、追加・更新／確認付き全件置換、重要なお知らせ、PIN変更、サーバー側スナップショットの保存・一覧・ワンタップ復元
- 全体告知：中止・会場変更・入場制限を全来場者へ即時表示し、解除まで一元管理
- 障害対策：可視状態に応じたポーリング（来場者約25秒・スタッフ約12秒、失敗時は自動で間隔延長）、差分なし時は転送をスキップ（ETag）、リクエストタイムアウト、端末キャッシュ、通信断時の閲覧、更新保留、復旧後再送、リビジョンによる競合検知、古い待ち時間の非表示、接続不安定の表示
- サーバー防御：入力のサーバー側検証と待ち時間の再計算、PIN総当たりの端末別＋全体レート制限、全操作の監査ログ、置換・復元前の自動スナップショット
- 配布：レスポンシブUI、PWA（iOS向けPNGアイコン同梱）、GitHub Pages向けワークフロー（Secrets未設定時はデプロイを中止）、Supabase Edge Function

## ローカル起動

```bash
npm install
cp .env.example .env.local
npm run dev
```

環境変数が空の場合はデモモードで動作します。デモモードの初期PINは更新用 `202608`・管理者 `202609` で、データはその端末のブラウザ内だけに保存されます。複数端末で運用する本番では、必ず共有APIを設定してください（本番ビルドでデモモードのまま公開すると、画面上部に常時警告バナーが表示されます）。

### PINと権限

| 権限 | できること | 初期PIN |
| --- | --- | --- |
| 更新用（スタッフ） | 担当企画の列人数・営業状態・お知らせの更新、バックアップ書き出し | `202608` |
| 管理者 | 上記すべて＋CSV/JSON取込・全件置換・重要なお知らせ・PIN変更・スナップショット保存/復元 | `202609` |

更新用PINが漏れても、全件置換やPIN変更などの破壊的操作はできません。**両方のPINを本番前に必ず変更してください。**

## 本番用バックエンド（Supabase）

1. Supabaseプロジェクトを作成します。
2. SQL Editorで `supabase/migrations/001_init.sql` と `002_hardening.sql` を順に実行します。
3. Supabase CLIでマイグレーションとEdge Functionを反映します。

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
# 複数オリジンはカンマ区切り（本番 + ローカル検証など）
supabase secrets set ALLOWED_ORIGIN=https://YOUR_ACCOUNT.github.io
supabase functions deploy festival-admin
```

4. Functionの `SUPABASE_URL`、秘密鍵、公開キーはSupabaseが提供する環境変数を利用します。`ALLOWED_ORIGIN` はGitHub Pagesのオリジンに限定してください。
5. GitHubリポジトリのActions secretsへ次を設定します。

```env
VITE_FESTIVAL_API_URL=https://YOUR_PROJECT.supabase.co/functions/v1/festival-admin
VITE_FESTIVAL_PUBLIC_KEY=YOUR_PUBLISHABLE_KEY
# Legacy projects may use VITE_FESTIVAL_ANON_KEY instead.
```

Secretsが未設定のままだと、デプロイは失敗して止まります（誤ってデモモードを本番公開しないため）。意図的にデモを公開する場合だけ、リポジトリ変数 `ALLOW_DEMO_DEPLOY=true` を設定してください。

テーブルはRLSを有効にし、ブラウザからの直接アクセスを許可していません。公開読取もスタッフ書込もEdge Function経由です。サービスロールキーをフロント側へ置かないでください。

## データテンプレート

- `public/templates/booths-template.csv`
- `public/templates/timetable-template.csv`

アプリの運営画面からも同じ形式をダウンロードできます。CSVはUTF-8（BOM付き）です。Excelで編集後、CSV UTF-8形式で保存してください。

### 企画カテゴリ

`attraction`, `food`, `game`, `experience`, `stage`, `exhibition`, `other`

### 企画ステータス

- `open`: 営業中
- `paused`: 一時停止
- `closed`: 準備中・終了
- `sold_out`: 受付終了・売切

## 品質確認

```bash
npm run typecheck
npm run test
npm run build
```

## 運用文書

詳しい準備、当日手順、障害復旧、チェックリストは [docs/OPERATION_MANUAL.md](docs/OPERATION_MANUAL.md) を参照してください。

## セキュリティ上の注意

- 初期PIN（更新用 `202608`・管理者 `202609`）は本番前に必ず両方変更してください。
- PINをQRコード、公開資料、来場者向けサイトへ掲載しないでください。管理者PINはシステム責任者と運営本部の数名だけに共有してください。
- SupabaseのサービスロールキーをGitHub、フロント環境変数、スクリーンショットへ載せないでください。
- PIN認証は端末単位（10分8回で15分ロック）と全体（10分40回で10分停止）の二段でレート制限されます。ロック中は正しいPINでも待つ必要があります。
- 本番前に全件バックアップを保存してください。全件置換・復元時は、端末へのダウンロードに加えてサーバー側にも直前のスナップショットが自動保存されます（最新30件保持）。
- スタッフの全更新操作は `audit_log` テーブルに記録されます（IP+UAのハッシュのみ。個人情報は保存しません）。いたずらや誤操作の切り分けに使えます。
- 重要なお知らせは通信断中に保留されません。放送・現地掲示と併用してください。
