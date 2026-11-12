const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../services/seniorQr.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, require: () => ({ API_BASE_URL: 'https://example.test' }), Date };
vm.runInNewContext(compiled, context);
const { pendingServiceLines } = context.exports;
const benefits = [
  { user_id: 24, benefit_type: 'Octogenarian', benefit_status: 'For Processing', validation_status: 'Under Review' },
  ...['Released', 'Cancelled'].map(benefit_status => ({ user_id: 24, benefit_status })),
  { user_id: 24, benefit_status: 'Pending', validation_status: 'Rejected' },
  { user_id: 25, benefit_status: 'Pending' },
];
const movies = [
  { user_id: 24, status: 'Confirmed', movie_title: 'Upcoming Movie', screening_date: '2026-11-13' },
  { user_id: 24, status: 'Pending', screening_date: '2026-11-11' },
  { user_id: 24, status: 'Cancelled', screening_date: '2026-11-13' },
];
const lines = Array.from(pendingServiceLines(benefits, movies, 24, '2026-11-12'));
assert.equal(lines.length, 2);
assert.match(lines[0], /Octogenarian.*For Processing.*Under Review/);
assert.match(lines[1], /Upcoming Movie/);
assert.deepEqual(Array.from(pendingServiceLines([], [], 24, '2026-11-12')), ['Birthday benefits: none pending', 'Movie reservations: none pending']);
assert.ok(pendingServiceLines(null, null, 24, '2026-11-12').every(line => line.includes('unavailable')));
const many = Array.from({ length: 10 }, () => benefits[0]);
assert.equal(pendingServiceLines(many, [], 24, '2026-11-12').length, 6);
assert.match(pendingServiceLines(many, [], 24, '2026-11-12')[5], /more records/);
console.log('QR service summary checks passed');
