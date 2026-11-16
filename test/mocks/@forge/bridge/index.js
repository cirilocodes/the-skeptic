// @forge/bridge mock: invoke() goes to the real resolver through globalThis.__invoke (set by the test).
const calls = (globalThis.__bridge = globalThis.__bridge || { invokes: [], rovo: [] });
module.exports = {
  __esModule: true,
  invoke: async (fn, payload) => {
    calls.invokes.push(fn);
    return globalThis.__invoke(fn, payload);
  },
  rovo: { open: async (opts) => { calls.rovo.push(opts); } },
};
