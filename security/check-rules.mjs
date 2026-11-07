/* Static guard for security/firestore.rules (no emulator needed): the profit-funded rewards must stay owner-only.
   Run: node security/check-rules.mjs */
import { readFileSync } from 'node:fs';
const rules = readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');
const bad = [];
const pub = /allow read: if docId in \[([^\]]*)\]/.exec(rules);
if (!pub) bad.push('public settings list not found');
else {
  const ids = pub[1].split(',').map(x => x.trim().replace(/'/g, ''));
  for (const secret of ['economics', 'coupons', 'stats']) if (ids.includes(secret)) bad.push(`settings/${secret} must NOT be publicly readable (cost prices / owner data)`);
}
const edit = /function validOwnerEdit[\s\S]*?changed\.hasOnly\(\[([^\]]*)\]/.exec(rules);
if (!edit) bad.push('validOwnerEdit not found');
else for (const f of ['points', 'rewardPool', 'refPoints', 'referrals', 'redeemed', 'totalSpend', 'claimedMilestones']) if (edit[1].includes(`'${f}'`)) bad.push(`a customer must not be able to edit "${f}"`);
const create = /function validNewUser[\s\S]*?hasOnly\(\[([^\]]*)\]/.exec(rules);
if (!create) bad.push('validNewUser not found');
else for (const f of ['rewardPool', 'refPoints', 'redeemed', 'refRewarded']) if (create[1].includes(`'${f}'`)) bad.push(`a new account must not be able to start with "${f}"`);
if (!/match \/\{document=\*\*\} \{\s*allow read, write: if isAdmin\(\);/.test(rules)) bad.push('catch-all must stay owner-only (order_econ, reward_claims rely on it)');
for (const c of ['order_econ', 'reward_claims']) if (new RegExp(`match /${c}/`).test(rules)) bad.push(`${c} must not get its own (looser) rule`);
if (bad.length) { console.error('FAIL:\n - ' + bad.join('\n - ')); process.exit(1); }
console.log('OK: economics, order_econ, reward_claims are owner-only; customers cannot create or edit points, reward pool, referral counters');
