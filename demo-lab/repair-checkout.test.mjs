import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import evidence from './repair-evidence.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const names = ['baseline.mjs', 'candidate.mjs', 'acceptance.mjs'];
for (const autocrlf of ['true', 'input', 'false']) {
  test(`repair source checkout retains exact evidence bytes with core.autocrlf=${autocrlf}`, () => {
    const parent = resolve(tmpdir());
    const temporary = mkdtempSync(join(parent, 'portfolio-repair-checkout-'));
    try {
      const prefix = temporary.replaceAll('\\', '/') + '/';
      const files = names.map(name => `demo-lab/repair-example/${name}`);
      const checkout = spawnSync('git', ['-c', `core.autocrlf=${autocrlf}`, '-c', 'core.eol=crlf',
        'checkout-index', `--prefix=${prefix}`, '--', ...files], {
        cwd: root, encoding: 'utf8', timeout: 10000, windowsHide: true,
      });
      assert.equal(checkout.status, 0, checkout.error?.message ?? checkout.stderr);
      for (const name of names) {
        const bytes = readFileSync(join(temporary, 'demo-lab/repair-example', name));
        assert.equal(bytes.includes(Buffer.from('\r\n')), false, `${name} must retain LF`);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sourceHashes[name]);
      }
    } finally {
      // Delete only the freshly created directory within the resolved temp root.
      assert.equal(dirname(temporary), parent);
      assert.ok(temporary.startsWith(parent + sep + 'portfolio-repair-checkout-'));
      rmSync(temporary, { recursive: true, force: true });
    }
  });
}
