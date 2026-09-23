# QA checklist

## iPhone
- Safari portrait / landscape
- 320px–430px widths
- tap targets >=44px
- safe-area and keyboard behavior
- Add to Home Screen / standalone launch
- local settings persist after reload

## Conversation engine
- active conversation => no intervention
- cooldown prevents consecutive posts
- low/normal/high thresholds differ
- newcomer prompt only when enabled
- disabled features are never selected
- comment resets silence

## Spoon integration after docs
- auth failure / token expiry
- reconnect after network loss
- rate-limit handling
- duplicate event protection
- bot disclosure requirements
- no unsupported API assumptions
