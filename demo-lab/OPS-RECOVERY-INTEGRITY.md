# OPS-01 recovery receipt integrity

Run the local fault drill with Node.js 24:

~~~sh
node demo-lab/run-ops-receipt-integrity.mjs
node --test demo-lab/ops-receipt-integrity.test.mjs
~~~

A timeout before a write and a timeout after a write need different recovery actions. The first can be retried within the attempt cap. The second requires reconciliation against the persisted effect. The drill drives the original SQLite desk through both paths and reads the resulting receipts without changing them.

Read the state and integrity findings together. An uncertain receipt can be internally consistent when it has one matching local effect and an acknowledgement-loss event. An uncertain receipt whose effect row has disappeared needs investigation. A stopped receipt should have exhausted its attempt allowance without creating an effect.

The CLI prints the receipt IDs, statuses and named findings. The synthetic payload remains in the temporary database.

The drill uses synthetic contacts and a disposable local database. Its verifier checks one receipt and its persisted history and effect. It can detect the tested inconsistencies between those rows. Identity is checked against the saved source hash. The verifier does not compare that hash with a live checkout or prove that the local history is complete. It does not authenticate operators, establish provider delivery or detect a party that can coherently rewrite the entire record.
