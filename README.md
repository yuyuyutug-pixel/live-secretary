# LIVE秘書

Spoon LIVE向け配信支援SaaS。iPhone/Safariだけで操作し、Spoon Developers公式APIへOAuth接続する構成です。

## 現在の無料構成

- UI: Neon Function経由でGitHub公開ブランチの静的ファイルを配信
- Backend: Neon Functions / Node.js 24
- Spoon接続: OAuth 2.0 + LIVE SSE
- Railway: 不使用
- Supabase: 不使用
- Vercel: 不使用

### 公開URL

https://br-icy-poetry-a5uxrn77-livesecretary.compute.c-1.us-east-2.aws.neon.tech/

### Spoon OAuth Redirect URI

https://br-icy-poetry-a5uxrn77-livesecretary.compute.c-1.us-east-2.aws.neon.tech/api/oauth/callback

## v0.3

- Spoon OAuth 2.0連携
- LIVE SSEイベント受信
- chat / presence / like / donation / endイベント
- Botチャット送信
- Access/Refresh Tokenの暗号化HttpOnly Cookie保存
- iPhone向け管理UI
- 配信モード / BOT人格 / 介入度
- 沈黙時間に応じたコメント促進
- 心理テスト / 二択 / 話題提供 / ミニゲーム
- Mock Modeフォールバック

## 必須のSpoon環境変数

Neon Functionへ秘密情報として設定します。GitHubには保存しません。

```text
SPOON_CLIENT_ID=
SPOON_CLIENT_SECRET=
SPOON_REDIRECT_URI=https://br-icy-poetry-a5uxrn77-livesecretary.compute.c-1.us-east-2.aws.neon.tech/api/oauth/callback
```

SESSION_SECRET はNeon側へ設定済みです。

## API defaults

```text
SPOON_API_BASE=https://jp-openapi.spooncast.net
SPOON_AUTHORIZE_URL=https://spooncast.net/jp/oauth/authorize
SPOON_TOKEN_URL=https://jp-openapi.spooncast.net/v1/oauth/token
SPOON_EVENTS_URL=https://jp-openapi.spooncast.net/v1/live/events
SPOON_LIVE_URL=https://jp-openapi.spooncast.net/v1/live
SPOON_LISTENERS_URL=https://jp-openapi.spooncast.net/v1/live/listeners
SPOON_FANS_URL=https://jp-openapi.spooncast.net/v1/live/fans
SPOON_CHAT_URL=https://jp-openapi.spooncast.net/v1/live/chat
SPOON_CHAT_FIELD=message
SPOON_TOKEN_AUTH=basic
SPOON_SCOPES=live.read listeners.read fans.read events.chat events.presence events.like events.donation chat.send
```

## セキュリティ

- Client Secretはブラウザへ配信しません。
- Access/Refresh TokenはAES-256-GCMで暗号化したHttpOnly/Secure Cookieに保存します。
- 視聴数等を不正操作する機能は実装しません。
- 心理テストは娯楽用途です。
