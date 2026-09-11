import type { Env as WorkerEnv } from "../../worker/env.ts";

// `env` from "cloudflare:test" is typed as Cloudflare.Env; teach it our bindings.
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

export {};
