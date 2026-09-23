# LIVE秘書 Product Spec

## Mission
配信者を一人にしない。BOTは主役ではなく、人間同士の会話を始める補助役。

## Conversation state
ACTIVE → WATCHING → QUIET → NUDGE → TOPIC → PSYCH/GAME → COOLDOWN → ACTIVE

## Safety / policy
- 視聴数・コメント数等の不正操作をしない
- 自動スパムをしない
- 心理テストは娯楽用途。医療・性格の断定をしない
- Spoon公式APIで許可されたイベント/操作だけを実装
- API公開前はMockProviderのみ

## Planned modules
Dashboard / Stream setup / Conversation engine / Content library / Persona / Games / Analytics / Provider adapter / Account / Feature flags / Billing placeholder.

## Spoon adapter checklist (9/30)
Authentication, scopes, LIVE identification, comment events, join/leave events, bot message endpoint, realtime transport, rate limits, storage rules, commercial use, bot disclosure, review requirements.
