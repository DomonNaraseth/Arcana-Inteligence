# Readings that answer the exact question, with close examples

Request (owner, 2026-11-19): answer each question as directly and precisely as possible, and give examples that sit as close to the question as possible.

## Limits we keep

The prompt still makes no accuracy claim and never guarantees an outcome (rule 6). Here, "precise" means three things:
- the answer has the shape the question asks for;
- it uses the person's own details;
- every claim is tied to a drawn card in a way code can check.

## Design

1. **Answer shape per intent (L3).** `answerShape(intent)` tells the model how to lead `direct_answer`. For example:
   - yes/no starts with a lean;
   - a decision names the options the person gave;
   - a timing question gives relative windows plus a timeline;
   - a feelings question reads the dynamic, never another person's thoughts;
   - a cause question names the main cause first.

   Together with a "use the person's own words and details" rule, this goes into the payload as `question.answer_shape`.
2. **Close examples (`examples`, 2–3 items).** Each item has:
   - `title`;
   - `example`: a concrete everyday scene from the person's own situation, written as "what this could look like", not a forecast;
   - `positions`: the card positions it rests on.

   The field is required for new readings. It is optional in the stored type, because older readings do not have it.
3. **Code checks in `verifyInterpretation`.** These come on top of the existing card id and position checks:
   - every position cited by an example was drawn;
   - `direct_answer` names at least one drawn card (English or Thai name);
   - yes/no readings open with a lean (โน้มไปทางใช่ / โน้มไปทางไม่ / ก้ำกึ่ง);
   - timing readings have a timeline.

   A failure triggers the existing single retry. After that, the existing flagged-delivery rule applies as before.
4. **Page.** A panel "ตัวอย่างที่ใกล้กับเรื่องของคุณ" sits right after the direct answer. It shows the card chips each example rests on and a note that examples illustrate the reading and do not confirm it. It also gets a read-aloud part, `examples`.
5. **Follow-up chat.** When explaining, give one concrete example drawn from the person's own situation.
6. **Versioning.** `PROMPT_VERSION` → `arcana-2026.11-v2`.

## Tests

- `verifyInterpretation`: each new check passes or fails as expected.
- `answerShape` covers every intent.
- The narration order includes `examples` when present.
