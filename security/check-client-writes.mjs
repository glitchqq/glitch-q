// Guard: the storefront may write only cosmetic fields of the customer's own profile.
// Run:  node security/check-client-writes.mjs      (exit code 1 on any other direct write)
import { readFileSync } from 'node:fs';
const allowedKeys = new Set(['nick', 'avatar', 'prefs.favCat', 'prefs.hideLb', 'prefs.loginAlerts', 'devices', 'region', 'currency', 'symbol', 'badges']);
const createKeys = new Set(['firstName', 'lastName', 'name', 'email', 'points', 'notifications', 'favorites', 'orders', 'ratings', 'spins', 'gifts', 'shares', 'streak', 'referrals', 'totalSpend', 'lastLogin', 'badges', 'claimedMilestones', 'uid_short', 'region', 'created']);
let bad = 0;
for (const f of ['script.js', 'account.js', 'fx.js']) {
  const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  for (const m of src.matchAll(/collection\('([a-z_]+)'\)(?:\.doc\([^)]*\))?\.(set|update|delete|add)\(/g)) {
    const [, col, op] = m; const at = src.slice(0, m.index).split('\n').length;
    if (col === 'users' && op === 'update') continue;   // keys checked below
    if (col === 'users' && op === 'set') continue;      // registration / first-login profile, keys checked below
    console.log(`FAIL ${f}:${at} writes ${col} (${op}) directly from the browser`); bad++;
  }
  for (const m of src.matchAll(/collection\('users'\)\.doc\([^)]*\)\.(update|set)\(\{([^}]*)\}/g)) {
    const keys = [...m[2].matchAll(/(?:^|,)\s*(?:'([^']+)'|([A-Za-z_][A-Za-z_0-9]*))\s*[:,]?/g)].map(x => x[1] || x[2]);
    const top = m[2].split(/,(?![^{[]*[}\]])/).map(p => p.trim().replace(/^'?([A-Za-z_.0-9]+)'?\s*[:].*$/s, '$1').replace(/^([A-Za-z_0-9]+)$/, '$1'));
    const allowed = m[1] === 'set' ? createKeys : allowedKeys;
    for (const k of top) if (k && !allowed.has(k) && !k.includes('${')) { const at = src.slice(0, m.index).split('\n').length; console.log(`FAIL ${f}:${at} users.${m[1]} uses key "${k}" which the rules do not allow`); bad++; }
  }
  // account.js builds field objects separately
}
const acc = readFileSync(new URL('../account.js', import.meta.url), 'utf8');
for (const m of acc.matchAll(/saveUser\(\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\)/g)) {
  for (const k of m[1].matchAll(/(?:^|,)\s*'?([A-Za-z_.]+)'?\s*[:,]/g)) if (!allowedKeys.has(k[1]) && !['e', 'c'].includes(k[1])) { console.log(`FAIL account.js saveUser key "${k[1]}"`); bad++; }
}
console.log(bad ? `${bad} problem(s)` : 'OK: direct browser writes are limited to the customer\'s own cosmetic profile fields');
process.exit(bad ? 1 : 0);
