// auth-check: proves the tenant certificate can authenticate against DGII for an environment.
import { environmentOf, json, loadSigner, type ActionContext } from "./context.ts";

export async function authCheck(ctx: ActionContext): Promise<Response> {
  const environment = environmentOf(ctx.payload);
  const sign = await loadSigner(ctx, environment);
  const token = await ctx.deps.dgii(environment).authenticate((seed) => sign(seed, "SemillaModel"));
  ctx.deps.log("auth_check_ok", { environment });
  // The token itself never leaves the function.
  return json(200, { ok: true, expiresAt: token.expiresAt });
}
