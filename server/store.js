import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Append-only audit log. Execution claims are flushed before dispatch, so a
// crash leaves an indeterminate claim that is never automatically retried.
export class Store {
  comparisons = new Map();
  executions = new Map();
  queue = Promise.resolve();
  constructor(path) { this.path = path; }
  async init() {
    await mkdir(dirname(this.path), { recursive: true });
    let text;
    try { text = await readFile(this.path, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; text = ''; }
    for (const line of text.split('\n').filter(Boolean)) this.apply(JSON.parse(line));
    return this;
  }
  apply(event) {
    if (event.type === 'comparison') this.comparisons.set(event.value.id, event.value);
    else if (event.type === 'execution') this.executions.set(event.id, event.value);
  }
  async append(event) {
    const operation = this.queue.then(async () => {
      const file = await open(this.path, 'a', 0o600);
      try { await file.writeFile(JSON.stringify(event) + '\n'); await file.sync(); }
      finally { await file.close(); }
      this.apply(event);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
