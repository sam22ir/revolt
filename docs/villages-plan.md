# Villages, trust and lessons (research)

Decided 27 Nov 2026 with Samir: research is not points. Players earn the **trust** of villages on the world map by answering their
needs, and villages **teach lessons** in return; the academy turns a taught lesson into a lasting bonus. Trust is **per player** and
**fades slowly** when a village is left alone. GDD pillars this serves: cooperation over predation (3), history with respect (2).

## Content rules (GDD §6)

- Villages are never attacked, burned, raided or punished, by anyone, in any mechanic or event. The colonial army may camp **near** a
  village (a patrol to clear); it never harms it.
- Villagers are never a resource. Every exchange is help given and knowledge shared; nothing is taken from a village.
- Village kinds and lesson names need historian review before release, like the story chapters (`docs/story-review.md`).

## Villages

Five kinds, each with a speciality. Names are i18n keys `village.<kind>.*`; Vietnam renames them per background.

| Kind | Speciality | Lessons (trust 1 → 2 → 3) |
| --- | --- | --- |
| `shepherds` | mountain paths | marches +6% speed → +6% → +8% |
| `smiths` | metalwork | troop tier 2 → 3 → 4 |
| `healers` | remedies | healing −15% cost → +5 batch per infirmary level → −20% time |
| `weavers` | cloth and bags | porters carry +15% → storage +10% → storage +10% |
| `messengers` | networks | forecasts as if the watchtower were 1 level higher → alliance help −20% more time → support +15% |

Placement (slice 2): a pure function of the map seed, like resource sites, never on roads, wadis or oases, spaced apart, each kind
spread across regions.

## Needs and help

A village has one **need** per day (mission day, local midnight, as daily missions), the same for every player, picked from the seed,
the village and the day. Kinds of need:

- `food` / `funds`: deliver an amount (scaled by trust level), carried by a march with porters' capacity;
- `care`: the infirmary sends help (needs infirmary level 2; costs food and funds);
- `labor`: lend troops for a few hours (they come back unharmed);
- `protection`: beat the colonial patrol camped near the village (a normal NPC battle within a few tiles).

Answering the day's need once raises that player's trust with that village; one answer per village per day.

## Trust

- Stored per player, per village helped: `{ trust, at }`. Read at time `now` as `max(0, trust − decay × (now − at))`; time going
  backwards never adds trust. Capped at `TRUST_MAX`.
- Trust levels 1, 2, 3 at fixed thresholds. Reaching a level for the first time **teaches** that level's lesson; a taught lesson is kept
  for good. Fading only means the next level needs more help.

## Academy (slice 3)

A new building. A taught lesson is studied there (resources and time, one at a time); a studied lesson's effect applies from then on.
A lesson of level N needs academy level N × 2 − 1 (1, 3, 5).

## Slices

1. Design and rules: villages, needs, trust with fading, lessons taught (this PR).
2. Server: placement on the map, the aid march and intents, trust stored in the base, map view.
3. Academy and lesson effects in the rules (march speed, tiers, healing, carry, storage, forecast, help, support).
4. Godot: villages on the map, the aid sheet, the academy screen; Blender art for villages and the academy.
