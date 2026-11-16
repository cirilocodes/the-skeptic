class Resolver {
  constructor() {
    this.fns = {};
  }
  define(k, f) {
    this.fns[k] = f;
    return this;
  }
  getDefinitions() {
    const fns = this.fns;
    return async (req) => fns[req.call.functionKey](req);
  }
}
module.exports = { __esModule: true, default: Resolver };
