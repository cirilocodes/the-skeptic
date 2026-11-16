const routeTag = (strings, ...vals) => strings.reduce((acc, s, i) => acc + s + (i < vals.length ? encodeURIComponent(String(vals[i])).replace(/%2F/g,'/') : ''), '');
const state = globalThis.__sim;
function mk(who) {
  const handle = async (product, path, opts = {}) => {
    state.calls.push(`${who} ${opts.method||'GET'} ${path}`);
    if (who === 'user' && state.noUser) throw new Error('asUser not available');
    const r = state.respond(product, path, opts, who);
    return { ok: r.status < 300, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  return { requestJira: (p, o) => handle('jira', p, o), requestConfluence: (p, o) => handle('confluence', p, o) };
}
const webTrigger = { getUrl: async (k) => `https://example.invalid/webtrigger/${k}` };
module.exports = { __esModule: true, default: { asUser: () => mk('user'), asApp: () => mk('app') }, route: routeTag, webTrigger };
