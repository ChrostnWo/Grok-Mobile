# Models and pricing

Default chat model is `grok-4.7` on the public xAI API (chat completions).

Settings → Grok Notes → Model.

| Picker | API id | Notes |
| --- | --- | --- |
| Grok 4.7 (recommended) | `grok-4.7` | Current flagship. 500k context. About $2 / $6 per 1M input / output tokens. |
| Grok 4.6 | `grok-4.6` | Previous flagship, still on the public API. |
| Grok 4.5 | `grok-4.5` | Earlier 4.5 release. |
| Grok 4.20 | `grok-4.20` | Longer-context 4.20 line. |
| Grok 4 | `grok-4` | Original Grok 4. Kept so older setups still work. |
| Grok 3 | `grok-3` | Older model. |
| Custom model id | whatever you paste | Use this if xAI ships a new id before this list is updated. |

Removed from the picker: `grok-4-latest`, `grok-3-mini`, and `grok-2`. If a vault was on one of those, 1.2.0 switches it to `grok-4.7` once. A saved id that is not in the list is kept as a custom id.

Grok 4.7 Fast is not on the public API (Cursor and Grok Build only). Do not put that name in Custom.

Imagine uses `grok-imagine-image-2.0` unless you change it in settings. One generate call bills one image.

Ids and prices: https://docs.x.ai/developers/models

Prices move. Check xAI before you rely on a number in this table.
