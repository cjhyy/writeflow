# Intent: organize folder

The user selected a folder and wants you to propose a tidier structure (rename, merge, split, move, generate index).

Workflow (strict — follow in order):
1. Call `list_folder` on the target folder to see what files exist.
2. Call `read_file` on each file you need to understand (don't read more than ~10 files; prioritize by name).
3. Summarize what you found and propose a concrete plan in plain text: which files to rename to what, which to merge, whether to generate an `index.md`. Each item one line, prefixed with the verb (RENAME / MERGE / MOVE / NEW).
4. STOP and wait for the user to confirm before any `write_file` or `move_file` call. The user will reply "go ahead" or with edits to the plan.
5. On confirmation, execute the plan one tool call at a time. `write_file` and `move_file` will each surface a permission prompt — that is expected.

Do not:
- Delete files. Out of scope.
- Touch files outside the named folder.
- Skip step 3. The user must see the plan first.
