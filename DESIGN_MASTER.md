# LIVE秘書 — Design Master v1.0

## 0. Purpose
LIVE秘書は「配信者を一人にしない」を体験として成立させる。
見た瞬間に「配信専用の相棒」「Spoon LIVE向け」「無料ツールっぽくない」ことが伝わることを最優先にする。

## 1. Brand Core
- Main message: 配信者を一人にしない
- Product role: 配信中の沈黙・話題切れ・初見対応・参加促進を補助する相棒
- Personality: 親しみ / 高品質 / 少し未来的 / 配信特化 / 過度にAIっぽくしない
- Visual keywords: dark / neon / glossy / streaming / voice / companion / premium / friendly

## 2. Visual Language
### Base
- Background: #070914 / #0A0D1A / #0E1222
- Surface: #11172A / #171D33
- Divider: rgba(255,255,255,.08)

### Accent hierarchy
1. Main CTA: coral → magenta
2. Brand glow: magenta → purple
3. Assist/active state: cyan
4. Premium/reward: gold
5. Error/end: rose red

Recommended gradients:
- Primary CTA: linear-gradient(100deg,#FF7A45 0%,#FF4FA3 48%,#9A67FF 100%)
- Brand glow: linear-gradient(110deg,#FF5A95,#A765FF)
- Cool assist: linear-gradient(110deg,#4BDDEB,#7D73FF)

## 3. Typography
Japanese typography must feel intentionally designed, not browser-default.

### Font roles
- Display / Hero: "Zen Kaku Gothic New", "Noto Sans JP", sans-serif
- UI / Body: "Noto Sans JP", -apple-system, BlinkMacSystemFont, sans-serif
- Numbers / Metrics: "Inter", "SF Pro Display", -apple-system, sans-serif

### Weight rules
- Hero: 800–900
- Section heading: 700–800
- Card title: 700
- Body: 400–500
- Label: 700 with tracking
- Metrics: 700–800

### Size system for mobile
- Hero: 30–34px / 1.15
- H2: 20–24px
- H3: 15–17px
- Body: 12–14px
- Secondary: 10–11px
- Label: 8–10px
- Metric: 24–34px

Rules:
- Do not use more than 3 text sizes inside one card.
- Labels must be uppercase English or concise Japanese, never both excessively.
- Avoid tiny 6–7px text except non-essential metadata.
- Main actions must be readable without zooming on iPhone.

## 4. Shape & Surface
- Major cards: radius 18–22px
- Buttons: radius 14–18px
- Chips: fully rounded
- Icon tiles: radius 12–14px
- Borders: 1px translucent, never harsh solid outlines
- Use layered gradients and inner highlights; avoid flat solid cards everywhere
- Shadow: soft, colored, low-opacity
- Glass effect only for overlays/nav/status, not every card

## 5. Mascot System
LIVE秘書BOT is the visual anchor.

### Canonical appearance
- White compact robot
- Rounded screen-like head
- Glossy black visor
- Cyan + pink eyes
- Gold crown
- Coral/orange headphones
- Glowing heart core
- Cute but premium; not toy-like
- Same face/body proportions across every state

### Required states
- normal
- wink
- cheer
- working
- listening
- thinking
- welcome
- celebrate
- sleepy/night
- alert
- premium
- empty-state

Mascot must appear at key moments only. Do not spam mascot in every card.

## 6. Icon System
- One consistent family
- Rounded 3D/glossy style for feature icons
- Simple monochrome line icons for bottom nav and utility controls
- Never mix emoji with production icons
- Never mix unrelated icon styles

Core icons:
home / secretary / schedule / plans / topic / psychology / game / analytics / settings / microphone / waveform / comments / listeners / gift / heart / crown / fire / calendar / clock / search / filter / play / stop / back / more

## 7. Screen Hierarchy

### Home
Goal: In 3 seconds, user understands what LIVE秘書 does.
1. Logo / connection status
2. Mascot hero
3. Strong headline
4. Primary CTA
5. LIVE mode selector
6. Quick actions
7. Secretary recommendation
8. Today recommendation

Home must not look like a settings dashboard.

### LIVE
Goal: Streamer can glance at it while broadcasting.
- Listener count
- Comment count
- Silence timer
- Current mode
- Secretary state
- Conversation feed
- Large assist actions
- One-tap "今すぐ一手"
- Clear end-session action
- Avoid dense text

### Secretary
Goal: Feel like talking to an assistant, not browsing a menu.
- Mascot large
- Current status
- Next recommended action
- 3 primary actions maximum
- Context-aware copy

### Settings
Goal: "育てる / 自分仕様にする"
- Persona selection
- LIVE mode selection
- Intervention strength
- Feature toggles
- Today topic
- Preview of selected secretary personality

### Content Library
Goal: Find something useful in less than 5 seconds.
- Search
- Category chips
- Cards with category, usage timing, and prompt
- Favorite/save later
- Recently used
- Avoid text-wall list

### Psychology
- Full-width visual card
- Question
- 4 large choices
- Result reveal / discussion hook
- Explicit entertainment disclaimer

### Games
- Visual category cards
- One-line rule
- Difficulty / tempo labels
- One-tap start

### Analytics
Goal: Answer "今日の枠どうやった？"
Primary metrics:
- Duration
- Comments
- Assists
- Response rate
- Max silence
Secondary:
- Best-performing prompt type
- Time zone / mode
- Secretary memo
Charts must be simple and useful.

### Schedule
- Upcoming live
- Prep checklist
- Planned mode
- Planned topic
- Reminder/status

### Plans
- FREE / STANDARD / PRO
- Value hierarchy must be visually obvious
- Avoid placeholder-feeling pricing table
- Premium card gets gold treatment, not just a border

## 8. Motion
- Page transition: 160–220ms
- Button press: scale .98
- Mascot idle: subtle float/breath
- Active listening: soft cyan pulse
- Assist trigger: quick glow + short upward motion
- Avoid excessive looping animations

## 9. Microcopy
Tone:
- short
- supportive
- streamer-oriented
- not robotic
- not overly cute

Examples:
- "会話が動いているので見守ります"
- "そろそろ一手、出しますか？"
- "初見さんが入りました"
- "この話題、今の空気に合いそうです"
- "今日は介入少なめで十分でした"

Avoid:
- generic AI wording
- long explanations in live screen
- exaggerated claims

## 10. Asset Quality Bar
Every production asset must be:
- independent file
- transparent PNG where applicable
- no baked checkerboard
- no filename text
- no collage / sprite / sheet
- consistent lighting and perspective
- enough transparent padding
- web optimized
- checked at real mobile size

## 11. Asset Priority
### P0 — must complete before visual release
- main logo / compact logo / app icon
- 8–12 mascot states
- bottom nav icons
- quick action icons
- LIVE state icons
- primary/secondary button artwork where needed
- home hero background
- live-room background
- psychology visual
- game visual set
- analytics accents
- schedule visual
- premium crown visual

### P1
- persona visuals
- empty states
- badges
- decorative waveform / sparkles / orbit
- ranking/reward assets
- card background variants

## 12. Quality Checklist
Before shipping each screen:
- Does the main action stand out immediately?
- Is there one clear visual focal point?
- Are typography roles obvious?
- Are icon styles consistent?
- Does it feel like a paid product?
- Does it still feel related to Spoon LIVE without imitating official branding?
- Can it be operated one-handed on iPhone?
- Are all tap targets at least ~44px?
- Is there any obvious placeholder/emoji/default-browser look?
- Does the screen still work without decorative assets?

## 13. Non-negotiables
- No emoji as final production icons
- No random mixed icon packs
- No checkerboard-background PNGs
- No oversized desktop-style layouts
- No overuse of purple-only SaaS visuals
- No visual drift from dark navy + coral/pink + purple + cyan + gold
- No fake official Spoon branding
- No sheet/collage assets in production
- One asset = one file

## 14. Definition of Done
A screen is complete only when:
1. Visual hierarchy is clear
2. Typography is polished
3. Assets are production-quality
4. iPhone width is verified
5. Main interactions work
6. No placeholder SVG/emoji remains
7. Dark-mode contrast is sufficient
8. The result matches this master, not ad-hoc decisions
