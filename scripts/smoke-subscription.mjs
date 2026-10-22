import assert from 'node:assert/strict';

// Run only against the locally running StudyHub. Uses an invented, disallowed URL.
const base='http://127.0.0.1:3000';
const page=await fetch(base);
assert.equal(page.status,200);
const html=await page.text();
assert.ok(html.includes('ICS-Kalender importieren'));
assert.ok(html.includes('Kalender per Link abonnieren'));
const form=html.match(/<form\b[^>]*>[\s\S]*?<\/form>/g)?.find(f=>f.includes('name="url"'));
assert.ok(form,'Subscription form is present');
assert.ok(form.includes('type="password"'));
const action=form.match(/name="(\$ACTION_ID_[^"]+)"/);
assert.ok(action,'Server action is present');
const token='SYNTHETIC_SMOKE_TEST_DO_NOT_STORE';
const fields=new FormData();
fields.set(action[1],'');fields.set('action','subscribe');
fields.set('url',`https://not-allowed.invalid/calendar?token=${token}`);
fields.set('from','2026-01-01');fields.set('to','2027-01-01');
const result=await fetch(base,{method:'POST',headers:{Origin:base},body:fields});
assert.equal(result.status,200);
const resultHtml=await result.text();
assert.ok(resultHtml.includes('Kalenderabonnement fehlgeschlagen.'));
assert.ok(!result.url.includes(token));assert.ok(!resultHtml.includes(token));
assert.ok(!resultHtml.includes('subscriptionUrlEncrypted'));
const followingWeek=await fetch(`${base}/?week=1`);
assert.equal(followingWeek.status,200);
console.log('HTTP-Prüfung erfolgreich: Dateiimport, Abonnementformular, sicher abgewiesener Testlink und Wochennavigation.');
