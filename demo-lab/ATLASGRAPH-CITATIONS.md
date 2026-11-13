# AtlasGraph citation evaluation

Run the evaluator from the repository root with Node.js 24 or later.

```sh
node demo-lab/run-atlasgraph-citations.mjs
node --test demo-lab/atlasgraph-citation-gate.test.mjs
```

The runner imports the bundled synthetic shipment Markdown through the existing preview and compile flow. It asks the AtlasGraph retrieval engine for three annotated claims and stores the resulting receipt in an in-memory SQLite database. It also creates a separate receipt for a question with missing evidence. The report lists the expected and observed decision for each of 12 named cases and exits with a failure status if any case disagrees.

`gradeCandidate(desk, { tenant, receiptId }, candidate)` uses a trusted local AtlasGraph desk. The caller selects the tenant and receipt with the original retrieval request context. A candidate supplies a status and a list of structured claims. Each claim includes the key, value, page ID and exact quote. The grader reads the receipt and cited pages from the desk. It accepts only complete answers that match the receipt and their approved source pages. It checks source version, hash and text and requires the exact quote to contain the annotated claim value. A grounded abstention has no claims and matches an abstained receipt.

Negative cases cover fabricated citations, a real page cited for the wrong claim, fabricated or unrelated quotes, changed values, omitted claims, unnecessary abstention, answers without supporting evidence, a wrong-tenant receipt lookup, and a receipt made stale by reimporting a source revision. Separate tests check malformed and duplicate claims, extra prose fields, and inconsistent stored citation text.

This complements the [retrieval comparison](ATLASGRAPH-EVALUATION.md) by testing how a consumer can reject an ungrounded proposed answer after retrieval. The candidates, annotations and expected decisions are authored synthetic fixtures. Exact matches establish consistency with those annotations. Paraphrase and semantic entailment evaluation, model calls, external labeling, authenticated tenant access and a full provider integration are outside this local scope.
