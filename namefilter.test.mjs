// Account-name filter test — run with:  node namefilter.test.mjs
// Checks namefilter.js (the shop) against: words that must be refused (in several languages and with the usual tricks),
// real names / ordinary words that must NEVER be refused, and that worker/worker.js carries the identical copy.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(here, f), 'utf8');
const BLOCK = /\/\* NAMEFILTER:BEGIN \*\/[\s\S]*?\/\* NAMEFILTER:END \*\//;
let pass = 0, fail = 0; const failures = [];
const ok = (c, m) => { if (c) pass++; else { fail++; failures.push(m); } };

const client = read('namefilter.js').match(BLOCK)?.[0];
const worker = read('worker/worker.js').match(BLOCK)?.[0];
ok(!!client, 'namefilter.js has the NAMEFILTER block');
ok(!!worker, 'worker/worker.js has the NAMEFILTER block');
ok(client === worker, 'the Worker copy of the name filter is word for word the same as the shop copy (copy the block from namefilter.js)');

const NF = vm.runInNewContext(client + '\nNF;', {});

/* must be refused */
const BAD = [
  // insults / vulgar — English, with tricks
  'fuck', 'FUCK you', 'f u c k', 'f.u.c.k', 'f_u_c_k', 'fuuuuck', 'ƒuck', 'fúck', 'sh1t', 'sh!t', 'b1tch', 'b!tch', 'a$$hole', 'p0rnhub', 'xVideos', 'Dumbass', 'BigAss', 'ass', 'cunt', 'Dick', 'MotherFucker99', 'pussy', 'Whore', 'slut_77', 'nigger', 'N1gger', 'nigga', 'faggot',
  'sex', 'S3X', 'sexy', 'rapist', 'pedo', 'cum', 'milf', 'hentai', 'nudes', 'blowjob', 'anal',
  // Cyrillic look-alikes of Latin letters
  'fuсk', 'shіt', 'bitсh',
  // French / Spanish / Turkish / German / Italian / Portuguese / Russian
  'putain', 'connard', 'salope', 'enculé', 'NTM', 'fdp', 'nique', 'merde', 'pute', 'mierda', 'puta', 'cabrón', 'pendejo', 'orospu', 'siktir', 'amk', 'Scheiße', 'arschloch', 'fotze', 'cazzo', 'vaffanculo', 'caralho', 'пизда', 'блядь', 'хуй', 'мудак', 'сука',
  // Arabic — with tricks (vowel marks, tatweel, spacing, letter variants)
  'كسمك', 'ك س م ك', 'كـسـمـك', 'كَسمك', 'نيكمك', 'ابن الحرام', 'إبن الحرام', 'ولد الحرام', 'شرموطة', 'شرموط', 'قحبة', 'قحبه', 'عاهرة', 'ديوث', 'يلعن دينك', 'يلعن ربك', 'ينيك', 'منيوك', 'متناك', 'طيز', 'زب', 'كس', 'نيك', 'عرص', 'سكس', 'سكسي', 'اباحي', 'إباحية', 'اغتصاب', 'ولد الكلب', 'ابن الكلب', 'يلعن',
  // Arabizi (Maghreb chat spelling)
  '9a7ba', '9ahba', 'kahba', 'qahba', 'sharmouta', 'charmouta', 'nikomak', 'nikmok', 'nik omak', 'ksomak', 'kosomak', 'zebi', 'zamel', 'tnaka', 'ibn el haram', 'ould lharam', 'dayouth', '3ars',
  // Persian / Urdu
  'كسكش', 'حرامزاده', 'مادر جنده',
  // faith ("haram"): drugs / alcohol
  'cocaine', 'Hashish', 'vodka', 'whisky', 'كوكايين', 'حشيش',
  // political — leaders, regimes, extremist groups
  'bouteflika', 'Boutef', 'tebboune', 'تبون', 'بوتفليقة', 'شنقريحة', 'macron', 'ماكرون', 'trump', 'TRUMP', 'ترامب', 'biden', 'putin', 'بوتين', 'netanyahu', 'نتنياهو', 'السيسي', 'القذافي', 'erdogan', 'اردوغان', 'hitler', 'هتلر', 'Hitler_88', 'nazi', 'daesh', 'داعش', 'taliban', 'طالبان', 'zionist', 'صهيوني', 'حزب الله', 'hezbollah', 'polisario', 'البوليساريو', 'israel', 'إسرائيل',
  // an "ال" in front and digits at the end do not hide a word
  'الترامب', 'trump2024', 'ass99',
];
/* must NEVER be refused: real names, common words, gamer handles */
const GOOD = [
  'Mohamed', 'Ahmed', 'Abdelkader', 'Yacine', 'Nadir', 'Samir', 'Karim', 'Amine', 'Rania', 'Lina', 'Sofiane', 'Walid', 'Zubair', 'Nazir', 'Nazim', 'Bassem', 'Assia', 'Kassim', 'Hassan', 'Massinissa', 'Tinhinane',
  'Monique', 'Dominique', 'Veronique', 'Nigeria', 'Niger', 'Computer', 'Computing', 'Therapist', 'Analyst', 'Canal', 'Dickens', 'Hancock', 'Peacock', 'Cocktail', 'Cumberland', 'Document', 'Classic', 'Assassin', 'Essex', 'Sussex', 'Sextant', 'Grape', 'Scunthorpe', 'Passion', 'Class', 'Glass', 'Mass', 'Assam', 'Bitcoin', 'Shiitake', 'Pushkin', 'Trumpet', 'Bida', 'Tweed', 'Methods', 'Therapy', 'Elisa', 'Sixx', 'xXx_Gamer_xXx', 'ProGamer', 'Shadow_99', 'DarkKnight', 'Ghost', 'Sniper', 'Noob', 'KSI', 'Skull', 'Hawk', 'Titan', 'Phoenix', 'Glitch Fan', 'Dragon Slayer', 'Night Wolf', 'Zero', 'Alpha', 'Nick', 'Mick', 'Rick', 'Sara', 'Ali', 'Omar', 'Youssef', 'Ilyes', 'Anis', 'Lamine', 'Racha', 'Meriem', 'Imane', 'Khadija', 'Fatima', 'Sabrina', 'Nassima', 'Kenza', 'Dounia', 'Selma',
  'محمد', 'أحمد', 'عبد الله', 'عبد القادر', 'ياسين', 'نادر', 'سمير', 'كريم', 'أمين', 'رانيا', 'ليلى', 'زينب', 'زبير', 'عمر', 'يوسف', 'إلياس', 'خديجة', 'فاطمة', 'سارة', 'مريم', 'إيمان', 'لاعب', 'محترف', 'الصقر', 'الأسد', 'ملك الألعاب', 'نجم', 'ظل', 'كوني', 'يكتبون', 'مكتبة', 'مجندة', 'كسوة', 'اسم', 'مكسب', 'كاسر', 'نيكول', 'سكر', 'بطل', 'فلسطين', 'الجزائر', 'تلمسان', 'وهران',
  'Привет', 'Алексей', 'Мария', 'Сергей',
  '', '   ', null, undefined,
];
for (const n of BAD) ok(NF.bad(n) === true, 'must be refused: ' + JSON.stringify(n));
for (const n of GOOD) ok(NF.bad(n) === false, 'must be allowed: ' + JSON.stringify(n));

/* hostile input cannot hang or throw */
for (const n of ['a'.repeat(5000), 'ـ'.repeat(5000), '‮​'.repeat(300), '9'.repeat(400), '(((((((((((((((((((((((', '😀'.repeat(300), 'ab'.repeat(2000)]) {
  const t0 = Date.now(); let r; try { r = NF.bad(n); } catch (e) { r = 'threw'; }
  ok(typeof r === 'boolean' && Date.now() - t0 < 200, 'hostile input is handled quickly: ' + n.slice(0, 12));
}
ok(NF.bad({ toString() { return 'fuck'; } }) === true, 'objects are converted to text first');

console.log(`${pass} passed, ${fail} failed`);
if (fail) { for (const f of failures) console.log('FAIL', f); process.exit(1); }
