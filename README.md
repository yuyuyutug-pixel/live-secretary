# LIVE秘書

Spoon LIVE向け配信支援SaaS。iPhone/Safariから操作し、公式Spoon Developers APIへOAuth接続する構成です。

## v0.2
- iPhone向け管理UI
- Spoon OAuth 2.0連携
- LIVEイベントSSE受信
- chat / presence / like / donation / endイベントの受信
- Botチャット送信
- 配信モード / BOT人格 / 介入度
- 沈黙時間に応じたコメント促進
- 心理テスト / 二択 / 話題提供 / ミニゲーム
- 暗号化HttpOnly Cookieでトークン保持
- Mock Modeフォールバック

## 起動

```bash
npm start
```

`/health` が `{"ok":true}` を返せばGatewayは稼働しています。

## 必須環境変数

```text
SPOON_CLIENT_ID=
SPOON_CLIENT_SECRET=
SESSION_SECRET=
SPOON_REDIRECT_URI=https://YOUR_DOMAIN/api/oauth/callback
```

通常は以下のデフォルトを使用します。Spoon公式ドキュメント側の値が変更された場合は環境変数で上書きできます。

```text
SPOON_API_BASE=https://jp-openapi.spooncast.net
SPOON_AUTHORIZE_URL=https://spooncast.net/jp/oauth/authorize
SPOON_TOKEN_URL=https://jp-openapi.spooncast.net/v1/oauth/token
SPOON_EVENTS_URL=https://jp-openapi.spooncast.net/v1/live/events
SPOON_CHAT_URL=https://jp-openapi.spooncast.net/v1/live/chat
SPOON_CHAT_FIELD=message
SPOON_TOKEN_AUTH=basic
```

## セキュリティ
- Client Secretはブラウザへ配信しません。
- Access/Refresh TokenはAES-256-GCMで暗号化したHttpOnly/Secure Cookieに保存します。
- 視聴数等を不正操作する機能は実装しません。
- 心理テストは娯楽用途です。
