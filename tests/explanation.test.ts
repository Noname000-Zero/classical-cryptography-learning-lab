import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainSource, simulateCaesar, outputDifference } from '../web/code-explanation';

test('static reading preserves source line numbers, masks comments/literals and never invents execution', () => {
  const source = '// for(int i=0;i<9;i++)\n#include <iostream>\n/* if(false) {\ncout << 9; } */\nint main() {\n  std::cout << "for if while % =";\n  int a[3];\n  if(a[0]) a[1]++; else return 0;\n}';
  const steps = explainSource(source);
  assert.deepEqual(steps.map(s => s.line), [2, 5, 6, 7, 8, 9]);
  assert.equal(steps[2].source, '  std::cout << "for if while % =";');
  assert.equal(steps[2].notes.length, 1);
  assert.match(steps[2].notes[0], /output/);
  assert.match(steps[3].notes.join(' '), /mảng/);
  assert.match(steps[4].notes.join(' '), /Chưa biết nhánh/);
  assert.match(steps[4].notes.join(' '), /else/);
  assert.equal(explainSource('// only a comment').length, 0);
  assert.equal(explainSource('#include <string>')[0].notes.length, 1);
  assert.match(explainSource('#define LOOP for(int i=0;i<3;i++)')[0].notes[0], /tiền xử lý/);
  assert.ok(explainSource('int x;\n'.repeat(10000)).length <= 160);
});

test('unrecognized code and wrong Caesar formula remain static: no corrected execution trace is fabricated', () => {
  for (const source of ['custom_algorithm(data);', 'for(int i=0;i<s.size();i++) s[i]=(s[i]+k)%26;', 'int main(){std::cout<<1}']) {
    const steps = explainSource(source);
    assert.ok(steps.length);
    assert.ok(steps.every(step => !('variables' in step) && !('after' in step)));
    assert.equal(steps[0].source, source);
  }
});

test('Caesar independent simulation: abc +3, condition checks, immutable before/after and rewind snapshots', () => {
  const { steps, error } = simulateCaesar('abc', '3', false);
  assert.equal(error, undefined);
  const processing = steps.filter(step => step.formula);
  assert.deepEqual(processing.map(s => [s.index, s.before, s.after]), [[0, 'abc', 'dbc'], [1, 'dbc', 'dec'], [2, 'dec', 'def']]);
  assert.deepEqual(processing[0].variables.find(v => v.name === 's[0]'), { name: 's[0]', before: '"a"', after: '"d"' });
  assert.equal(steps.filter(s => s.condition === true).length, 3);
  assert.equal(steps.at(-1)?.condition, false);
  assert.equal(processing[0].before, 'abc');
  assert.equal(simulateCaesar('abc', '3', false).steps[0].after, 'abc');
});

test('Caesar model handles branch decisions, reverse, negative/large key and empty strings with bounds', () => {
  const result = (s: string, k: string, decrypt = false) => simulateCaesar(s, k, decrypt).steps.at(-1)?.after;
  assert.equal(result('aAzZ 09!', '-1'), 'zZyY 09!');
  assert.equal(result('Dwwdfn!', '29', true), 'Attack!');
  assert.equal(result('abc', '1000000'), result('abc', String(1000000 % 26)));
  const branches = simulateCaesar('aA!', '3', false).steps.filter(s => s.formula).map(s => s.branch);
  assert.deepEqual(branches, ['lower', 'upper', 'other']);
  assert.equal(result('', '3'), '');
  assert.equal(simulateCaesar('', '3', false).steps.filter(s => s.condition === true).length, 0);
  for (const key of ['NaN', 'Infinity', '3.5', '1e3', '9999999999999999999999', '1000001', '']) assert.ok(simulateCaesar('abc', key, false).error);
  assert.ok(simulateCaesar('a'.repeat(65), '3', false).error);
  assert.ok(simulateCaesar('tiếng Việt', '3', false).error);
  assert.equal(simulateCaesar('a'.repeat(64), '3', false).steps.length, 194);
});

test('output differences expose spaces, newlines, missing and extra characters without guessing error lines', () => {
  assert.match(outputDifference('def', 'deg'), /vị trí 3/);
  assert.match(outputDifference('a\n', 'a'), /kết thúc output/);
  assert.match(outputDifference('', ' '), /" "/);
  assert.match(outputDifference('same', 'same'), /giống nhau/);
});
