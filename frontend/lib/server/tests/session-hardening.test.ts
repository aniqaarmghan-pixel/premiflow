import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HttpError } from "../http";
import { parseVideoUrl } from "../marketplace/catalog-validation";
import { playableVideoUrl } from "../../app/marketplace-media";

const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

function serverAccepts(value: unknown): string | null {
  try {
    return parseVideoUrl(value);
  } catch (err) {
    assert.ok(err instanceof HttpError);
    return null;
  }
}

test("client playableVideoUrl matches the server gig video validation", () => {
  const samples = [
    "https://cdn.example.com/a.mp4",
    "https://cdn.example.com/b.WEBM",
    "https://cdn.example.com/c.ogv?x=1",
    "https://cdn.example.com/d.mov#t=2",
    "https://cdn.example.com/e.m4v",
    "https://cdn.example.com/page.html",
    "http://cdn.example.com/a.mp4",
    "https://u:p@cdn.example.com/a.mp4",
    "https://localhost/a.mp4",
    "https://box/a.mp4",
    "https://www.youtube.com/watch?v=1",
    "not a url",
    " https://cdn.example.com/trim.mp4 ",
    `https://cdn.example.com/${"x".repeat(520)}.mp4`,
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "https://vimeo.com/76979871",
    "https://player.vimeo.com/video/76979871",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ",
  ];
  for (const s of samples) {
    assert.equal(playableVideoUrl(s), serverAccepts(s), s);
  }
});

test("server session lookup: DB/network errors are 'unavailable' (503), only 401 is 'no session'", () => {
  const src = read("lib/server/account-auth/session.ts");
  assert.match(src, /class AccountSessionUnavailableError/);
  assert.match(src, /if \(isUnauthorizedSessionError\(err\)\) return null;/);
  assert.match(src, /throw new AccountSessionUnavailableError\(\)/);
  for (const route of ["app/api/account-wallets/route.ts", "lib/server/account-auth/notification-wallets.ts"]) {
    const r = read(route);
    assert.match(r, /AccountSessionUnavailableError/, route);
    assert.match(r, /status: 503/, route);
    assert.match(r, /"Retry-After": "2"/, route);
  }
});
