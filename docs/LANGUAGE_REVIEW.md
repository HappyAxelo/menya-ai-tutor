# Language and subject review

Nothing below has been reviewed yet. Do not describe Menya's French, Kinyarwanda or subject explanations as validated until fluent speakers and competent teachers have done this.

## Who is needed

| Reviewer | Reviews |
|---|---|
| Fluent Kinyarwanda secondary teacher (ideally two) | Tutor replies, picture labels, interface text |
| Fluent French teacher who knows the francophone school curriculum | Whether replies are truly *français facile*, and whether the terminology is correct |
| Maths, physics, chemistry, biology and computing teachers | Accuracy of explanations and worked examples |

## How to run it

1. Run the evaluation with the production model (see `VISUAL_TUTOR_UPGRADE.md`, section 10).
2. Give each reviewer `TEACHING_EVAL_RESULTS.md`. Every reply is there word for word, with a table to fill in.
3. Repeat scenarios 8 and 9 on several topics: each covers only one.
4. Record problems as specific rewrites ("this word; this is what a teacher would say").

## What to look for

**Kinyarwanda**
- Does it sound like a Rwandan teacher, or like translated English?
- Is any technical word invented, wrong, or not one students would know?
- Are the English or French terms shown where they help?
- Does the scientific meaning survive?

**Français facile**
- Could a secondary student learning French as a second or third language follow it?
- Are the terms the ones used in class? Is anything a literal copy of English?

**Every language**
- Is it correct? Simplified must never mean wrong.
- Does the picture match the words?
- Does the question test what was just taught?

## Text written for this upgrade that needs checking

**Kinyarwanda picture labels** (`supabase/functions/_shared/visualTemplates.ts`): Izuba, Amazi, Ikibabi, Imizi, Uruti, Isukari, mu mwuka, mu butaka, Imvura, Inyanja cyangwa ikiyaga, Ibicu. Cell and other scientific terms deliberately stay in English until a teacher supplies the accepted words.

**Interface text** in `menya/src/locales.js`, under "Lessons and visuals", for Kinyarwanda, French and Kiswahili.

**Teaching rules** in `supabase/functions/_shared/language.ts`.
