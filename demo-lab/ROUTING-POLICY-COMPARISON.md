# F04 routing policy comparison

Run the same three labeled support cases through three policies. Each policy starts with the same budget and sees the cases in the same order. The comparison uses the existing F04 citation verifier and fixed example proposals.

```sh
node demo-lab/run-routing-comparison.mjs
node demo-lab/run-routing-comparison.mjs 7
```

| Policy | Correct at 20 units | Spent at 20 units | Correct at 7 units |
| --- | ---: | ---: | ---: |
| Cheap only | 1 of 3 | 3 | 1 of 3 |
| Escalation only | 3 of 3 | 15 | 1 of 3 |
| Cheap then escalate | 3 of 3 | 13 | 2 of 3 |

At seven units, escalating every case leaves two cases without a verified result because the budget is too small. Starting cheap and escalating on verifier rejection leaves one. See the per-case traces for attempted routes, rejected evidence and budget stops. An accepted abstention is a verified result. A budget stop leaves the case unresolved.

Open `http://127.0.0.1:5680/flagships#F04` to edit and inspect the original routing fixture. The comparison reports synthetic units and labeled fixture outcomes. It does not measure model latency, actual token cost or generalize to other case orders.

## Find the smallest budget

~~~sh
node demo-lab/run-routing-comparison.mjs --frontier
~~~

The frontier scans every integer starting budget from 0 through 18, the sum of all configured attempts in this fixture. It records the first budget that reaches each observed exact score and the units actually spent at that budget. The cheap-first cascade first matches all three labels at 13 units. Escalation-only first matches all three at 15. Cheap-only never matches the shipping and unknown-policy cases. The scan preserves case order and does not assume that increasing a budget always improves accuracy.
