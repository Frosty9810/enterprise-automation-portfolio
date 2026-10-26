// Closed local fixture. It receives only a sanitized JSON DTO on stdin.
// Node's permission flag limits filesystem/child access; it is not an OS sandbox.
let input = '';
for await (const part of process.stdin) { input += part; if (Buffer.byteLength(input) > 24000) process.exit(2); }
try {
  const value = JSON.parse(input);
  if (!value || Object.keys(value).sort().join(',') !== 'frames,profile') process.exit(2);
  if (value.profile === 'echo') process.stdout.write(JSON.stringify({ output: `Local fixture received sanitized frames:\n${JSON.stringify(value.frames)}` }));
  else if (value.profile === 'variant-leak') process.stdout.write(JSON.stringify({ output: 'ada example' }));
  else if (value.profile === 'leak') process.stdout.write(JSON.stringify({ output: 'Ada Example' }));
  else if (value.profile === 'foreign-alias') process.stdout.write(JSON.stringify({ output: '[[VR:foreign-session:e01]]' }));
  else process.exit(2);
} catch { process.exit(2); }
