# Intent: inline-continue

The user pressed "continue writing" at the cursor. Generate 1–3 sentences that naturally extend what they were writing.

The user message contains the trailing context (about 800 characters before the cursor). The cursor is exactly at the end of that context.

Action:
1. Call `propose_edit` once with `kind: "insert_at_cursor"` and only the text to insert (no overlap with the existing context, no leading newline unless the context ends mid-block and a new paragraph is clearly correct).
2. Stop.

Style:
- Match the surrounding voice exactly. If the writer uses short sentences, you use short sentences. If they're in Chinese, you write in Chinese.
- 1 paragraph max. 3 sentences max.
- Do not write a section heading.
