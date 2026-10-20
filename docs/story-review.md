# Story review gate

GDD §6: historian review is a release gate. No story content ships before review. M5 is code-complete, but it is NOT accepted until this gate, an Arabic-language review and a real-phone check pass.

## State today

- Every chapter in `packages/rules/src/data/story.ts` has `reviewed: false`.
- The text (`story.algeria.*` in `ar`, `fr`, `en`) is neutral placeholder scene-setting: no dates, battles, places, real names or atrocities. Titles start with a draft marker and every scene starts with "Draft, needs historian review". The story panel always shows a draft notice.
- `apps/client/test/i18n.test.ts` fails if chapter text lacks the draft marker while the chapter is `reviewed: false`, or if story text exists that no chapter uses.
- Heroes are role-only ("inspired by", GDD §4.4, §6): no real names or portraits.
- Chapter 1 asks for command post level 2 (60 s), because a producer cannot be raised before the command post.

## Checklist for a chapter (against GDD §6)

- No playable colonial side; colonial forces appear only as an army or institution, never a people.
- Atrocities never appear as rewards or mechanics.
- Real events are context, not gameplay; real figures only if separately approved.
- Facts, dates and place names checked by the historian; Arabic text read by a native speaker.

## Flipping a chapter after review

1. Replace the placeholder text in all three locales with the reviewed text.
2. Remove the draft markers from that chapter's keys and set `reviewed: true` in `data/story.ts`.
3. Update the draft-marker test so reviewed chapters are exempt (it already skips `reviewed` chapters).
4. Keep the panel's draft notice until every chapter is reviewed.

Open question (GDD §12): who reviews the Algeria content.
