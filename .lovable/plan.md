## Goal
Replace every Lovable AI call in the app with direct Google Gemini API calls (using the new `GEMINI_API_KEY` secret), add a per-user credit system with admin-visible usage analytics, and let users generate/edit images, analyze videos, and send media inside user + group chats.

## 1. Gemini integration layer

Create a single shared edge-function helper `supabase/functions/_shared/gemini.ts`:
- `callGeminiText(messages, model)` → `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- `callGeminiVision(parts)` → same endpoint, multimodal input (image/video/file inline_data or fileUri)
- `callGeminiImageGen(prompt, refImage?)` → `gemini-2.5-flash-image` (Nano Banana) for generate + edit
- All use `Authorization: Bearer` + `x-goog-api-key: GEMINI_API_KEY`

Rewrite these existing edge functions to use it (delete Lovable-AI code paths):
- `ai-chat` — chat + smart replies + multimodal
- `call-ai` — live call assistant
- `astra-core` — admin agent
- `auto-feedback` — feedback generation

Models used:
- Normal: `gemini-2.5-flash`
- Advanced: `gemini-2.5-pro`
- Image gen/edit: `gemini-2.5-flash-image`
- Video/file analysis: `gemini-2.5-flash` (multimodal)

## 2. Credit system

New table `ai_credits`:
| field | meaning |
|---|---|
| user_id | FK |
| date (date) | daily bucket (UTC) |
| text_used / image_used / video_used / file_used / advanced_used | int counters |

Daily limits (enforced server-side in every AI edge function before calling Gemini):
| Role | text | media (img+vid+file) | advanced model |
|---|---|---|---|
| user | 20 | 3/day total | 1/day |
| member / senior_member / sub_admin (batch holders) | 100 | 10/day | 5/day |
| admin | ∞ (no check) | ∞ | ∞, but every 5 uses → AI replies with a "🔔 Admin notice: you've used 5 more advanced credits" line |

On limit hit: edge function returns `{ error: "credit_exhausted", resets_at }` → UI shows clear toast "Daily AI credits exhausted, refresh in Xh".

New table `ai_usage_log` for the dashboard (one row per call): user_id, model, kind (text/image/video/file/advanced), tokens_in, tokens_out, duration_ms, created_at.

## 3. Chat media generation/editing

In `ai-chat` edge function add command parsing:
- `/imagine <prompt>` → generate image, returns URL, message stored with `🎨` prefix
- `/edit <prompt>` (when replying to an image) → edits the referenced image
- Sending an image/video/file with text → multimodal analysis reply

Frontend (`AIChatThread.tsx`):
- New `+` action menu in composer: **Generate image / Edit image / Analyze media / Attach file**
- Reuse existing `FileUpload` to attach, but route through AI when in AI thread
- Render returned image URLs inline; "Edit this" + "Download" buttons on each AI image

## 4. Group/user chat media button

Already partly works via `FileUpload`. Issues to fix:
- Add prominent "+" button in `Chat.tsx` composer with menu: Photo, Video, File, Audio (already accepted by FileUpload, just needs the visible entrypoint)
- Fix the "click image → opens lovable error site" bug: messages currently store the raw public URL — make sure the renderer treats `📷/🎬/🎤/📎` prefixed messages as in-app media (open in modal/new tab to the storage URL), never to a route.

## 5. Admin "AI Credits" dashboard tab

New tab in `src/pages/Admin.tsx` → `AICreditsPanel.tsx`:
- KPI cards: total calls today, total tokens, image count, video count, file count, advanced count, est. cost
- Per-user table (sortable): name, role, text used, image used, video used, file used, advanced used, last used, % of limit
- Per-call log (last 200) with filters: user, model, kind, date range
- Charts: usage over last 7/30 days (Recharts area chart)
- "Reset credits" button per user (admin only)

## 6. Where Lovable AI is removed
Search and replace all `supabase.functions.invoke('ai-chat'|'call-ai'|'astra-core'|'auto-feedback')` consumers stay the same — only the edge function internals change, so frontend continues to work unchanged for those. Feedback system, AI assistant, call AI, smart replies all keep working but routed through Gemini.

## Technical details
- Gemini REST endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=${GEMINI_API_KEY}`
- For images Gemini returns base64 inline → upload to `chat-attachments` bucket, return public URL
- Credit check is a SQL function `check_and_consume_credit(user_id, kind)` returning boolean + remaining, called from each edge function
- Admin notification "every 5 credits" tracked with `admin_credit_counter` on `ai_credits` row, AI prepends the notice when counter % 5 == 0
- No frontend `GEMINI_API_KEY` exposure — all calls stay in edge functions

## Order of execution
1. Migration: `ai_credits`, `ai_usage_log` tables + `check_and_consume_credit` function + GRANTs + RLS
2. Shared Gemini helper + rewrite 4 edge functions
3. Add `/imagine` `/edit` + multimodal handling in `ai-chat`
4. Frontend: AI thread composer media menu
5. Frontend: fix chat media renderer + add prominent media button in group/user chat
6. Frontend: `AICreditsPanel` tab in Admin dashboard

Estimated ~12 file changes + 1 migration + 4 edge-function rewrites + 1 new admin component.
