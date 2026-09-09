// shared plumbing for dependency-free harnesses: protocol io and the proxy client.
// no runtime imports, so the base image is node + tsx + this directory.
// protocol: stdin {publicCase, proxyUrl, token, models, options} -> stdout {output, trace?} | {error} | {skipped, trace?}
import type { Models, PublicCase, Trace } from '../src/types.js';

export { readInput, generateVia, respond, type Input, type Generate };

// models: the harness's own choice from its manifest.
// main is for the guarded route, safety for the trusted safety route.
// options: the manifest's options object, as it is ({} when the manifest has none)
type Input = { publicCase: PublicCase; proxyUrl: string; token: string; models: Models; options: { [key: string]: unknown } };
type Generate = (prompt: string, temperature?: number) => Promise<string>;

async function readInput(): Promise<Input> {
  let chunks: Buffer[] = [];
  for await (let c of process.stdin) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString());
}

// a generate(prompt, temperature?) bound to this run's proxy route and token.
// temperature left undefined means the benchmark default, injected by the proxy.
// route '/v1' is the guarded model, '/safety/v1' the trusted safety model.
function generateVia(proxyUrl: string, token: string, model: string, route = '/v1'): Generate {
  return async function generate(prompt, temperature) {
    let res = await fetch(`${proxyUrl}${route}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        ...(temperature !== undefined ? { temperature } : {}),
      }),
    });
    if (!res.ok) throw Error(`model call failed: ${res.status} ${await res.text()}`);
    let data: any = await res.json();
    let text: string = data.choices?.[0]?.message?.content ?? '';
    // qwen3 and other reasoning models may emit <think>...</think> before the answer
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  };
}

function respond(obj: { output: string; trace?: Trace } | { error: string } | { skipped: string; trace?: Trace }) {
  process.stdout.write(JSON.stringify(obj));
}
