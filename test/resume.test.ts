import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertResumable, casesHash, jobKey, loadRecords } from '../src/resume.js';
import type { Case } from '../src/caseStore.js';

function c(id: string, input = 'x'): Case {
  return { pub: { id, suite: 's', task: 't', instructions: '', input }, priv: { id, graders: ['exact'], answer: 'yes' } };
}

// the run.json fields a resume compares
function manifest(over: { [k: string]: unknown } = {}) {
  return {
    runId: 'r',
    complete: false,
    systems: [{ name: 'direct', models: { main: 'm', safety: 'm' }, maxCalls: null, providers: null, options: { contextTokens: 250000 } }],
    suites: ['s'],
    cases: ['a', 'b'],
    casesHash: 'h',
    reps: 2,
    judges: { s: 'j' },
    sandbox: 'process',
    providers: { baseUrl: 'u', judgeBaseUrl: 'u', temperature: 0 },
    git: { rev: 'abc', dirty: [] },
    ...over,
  };
}

describe('casesHash', () => {
  it('should not depend on the order of the cases, and change with their content', () => {
    let h = casesHash([c('a'), c('b')]);
    assert.equal(casesHash([c('b'), c('a')]), h);
    assert.notEqual(casesHash([c('a'), c('b', 'y')]), h);
    assert.notEqual(casesHash([c('a')]), h);
  });
});

describe('loadRecords', () => {
  it('should read the records of a run folder, and none when there is no file yet', async () => {
    let dir = await mkdtemp(join(tmpdir(), 'run-'));
    assert.deepEqual(await loadRecords(dir), []);
    let r = (caseId: string, rep: number) => ({ run: { caseId, system: 'direct', repetition: rep }, grades: [], status: 'ok' });
    await writeFile(join(dir, 'results.jsonl'), `${JSON.stringify(r('a', 1))}\n${JSON.stringify(r('b', 1))}\n\n`);
    let records = await loadRecords(dir);
    assert.deepEqual(records.map((x) => jobKey(x.run)), ['direct/a/1', 'direct/b/1']);
  });
});

describe('assertResumable', () => {
  it('should accept the same configuration and warn about a code change', () => {
    assert.deepEqual(assertResumable(manifest(), manifest()), []);
    let warnings = assertResumable(manifest(), manifest({ git: { rev: 'def', dirty: ['src/cli.ts'] } }));
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /commit abc, now at def/);
    assert.match(warnings[1], /then \[none\], now \[src\/cli.ts\]/);
  });

  it('should refuse a run that differs in what shaped its records, naming the field', () => {
    let changed = (over: { [k: string]: unknown }, field: string) =>
      assert.throws(() => assertResumable(manifest(), manifest(over)), new RegExp(`cannot resume run r: ${field} differs`));
    changed({ cases: ['a', 'b', 'c'] }, 'cases');
    changed({ casesHash: 'other' }, 'casesHash');
    changed({ reps: 3 }, 'reps');
    changed({ sandbox: 'docker' }, 'sandbox');
    changed({ providers: { baseUrl: 'u', judgeBaseUrl: 'u', temperature: 1 } }, 'providers');
    // a harness option is part of the system: another context limit is another run
    let systems = [{ ...manifest().systems[0], options: { contextTokens: 100000 } }];
    changed({ systems }, 'systems');
  });

  it('should refuse a complete run', () => {
    assert.throws(() => assertResumable(manifest({ complete: true }), manifest()), /run r is complete; nothing to resume/);
  });
});
