export class PrismaClient {
  public _engineConfig: { log: unknown };

  constructor(opts: { log: unknown }) {
    this._engineConfig = { log: opts.log };
  }
}

