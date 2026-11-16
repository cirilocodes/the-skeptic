// Forge async events mock: pushed jobs are collected; tests drain them with globalThis.__queue.drain().
const existing = globalThis.__queue;
const pending = existing ? existing.pending : [];
const delayed = existing ? existing.delayed : [];
const q = existing || (globalThis.__queue = {
  pending,
  delayed,
  pushed: [],
  handler: null,
  async drain(max = 500) {
    let n = 0;
    while (pending.length && n < max) {
      const ev = pending.shift();
      n += 1;
      if (q.handler) await q.handler({ body: ev.body, jobId: `job-${n}` }, {});
    }
    return n;
  },
  // Delayed jobs (e.g. the 15-minute review timeout) only run when a test asks for them.
  async drainDelayed() {
    pending.push(...delayed.splice(0));
    return q.drain();
  },
});
class Queue {
  constructor({ key }) {
    this.key = key;
  }
  async push(events) {
    const list = Array.isArray(events) ? events : [events];
    for (const e of list) {
      q.pushed.push(e);
      (e.delayInSeconds ? delayed : pending).push(e);
    }
    return { jobId: `job-${q.pushed.length}` };
  }
}
const InvocationErrorCode = { FUNCTION_UPSTREAM_RATE_LIMITED: 'FUNCTION_UPSTREAM_RATE_LIMITED', FUNCTION_RETRY_REQUEST: 'FUNCTION_RETRY_REQUEST' };
class InvocationError {
  constructor(retryOptions) {
    return { _retry: true, retryOptions };
  }
}
module.exports = { __esModule: true, Queue, InvocationError, InvocationErrorCode };
