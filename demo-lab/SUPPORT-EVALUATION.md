# F03 support citation diagnostics

The support desk retrieves an approved excerpt or sends the question to an escalation review. Run the real F03 decision engine against a versioned set of synthetic questions and manually authored labels:

```sh
node demo-lab/run-support-evaluation.mjs
node --test demo-lab/support-evaluation.test.mjs
```

Read `metrics` for the summary and `cases` for the individual questions, reference decisions, observed citations and findings. The report includes hashes of the fixture corpus and labels. Open `http://127.0.0.1:5680/flagships#F03` for the existing single-question walkthrough.

## What the fixture run found

| Finding | Cases | Example |
| --- | ---: | --- |
| Exact decision and citation | 11 of 14 | The standard shipping question cites the delivery-time policy |
| False abstention | 1 | A paraphrased return question misses the approved return article |
| False answer | 1 | The shipping-price question gets a delivery-time excerpt |
| Wrong citation | 1 | The damaged-return question gets the general return policy |
| Citations to forbidden sources | 0 of 14 | The tested cross-tenant, unapproved and instruction-marked sources are excluded |

An answer earns credit only when the decision and required citation match the label and the excerpt matches its source. A correct abstention contains no citation. The report keeps every miss visible so changes to retrieval can be judged against the same labels.

The corpus is public, synthetic and authored for diagnosis. The score describes this small fixture set. The runtime uses lexical retrieval and exact excerpts. Semantic retrieval, unmarked injection detection and hosted-model behavior remain open.

## Compare the opt-in scoped policy

~~~sh
node demo-lab/run-support-evaluation.mjs --compare
~~~

The comparison runs both policies against the same frozen questions and labels. The scoped policy matched 14 of 14 on this development set, compared with 11 of 14 for the original lexical baseline. The rules were written after examining the three known misses. The result measures those corrections and regression coverage. Evaluation on an independently selected corpus remains open.

The original F03 behavior remains the default. In the local F03 editor, add "retrievalPolicy": "scoped-intent-v1" and use a concrete question such as "How many days do I have to send back a sealed purchase?" The console displays the rule and reason. The receipt records the recognized intent or why the question was held. The policy uses supplied topic tags and question forms to distinguish a supported request from a related topic, then returns the exact approved excerpt. Ambiguous questions, unsupported aspects and unavailable or competing sources go to review.
