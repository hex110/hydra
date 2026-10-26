/**
 * Electron appends its own and the app's name to the user agent. Cloudflare
 * ties `cf_clearance` to the user agent, so verification and later fetches
 * must send the same string, and a plain Chrome one is what a challenge
 * expects.
 */
export const toBrowserUserAgent = (userAgent: string) =>
  userAgent
    .replace(/\s(?:Electron|hydra-plus|Hydra Plus)\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
