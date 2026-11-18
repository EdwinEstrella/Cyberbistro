import { handleRequest, type Env } from "./handler";

export default {
  fetch: (req: Request, env: Env) => handleRequest(req, env),
};
