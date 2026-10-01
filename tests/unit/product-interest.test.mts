import assert from "node:assert/strict";
import test from "node:test";

const { toggleProductInterest } = await import(new URL("../../src/lib/product-interest.ts", import.meta.url).href);
const { productInterestSchema } = await import(new URL("../../src/lib/product-interest-validation.ts", import.meta.url).href);

const base = { visitorId: "5c5e57d2-b7d3-4d02-8f4e-12d128cb6c9f", placement: "home" };

test("permite una o dos opciones y rechaza duplicadas, vacías o tres", () => {
  for (const choices of [["socks"], ["socks", "skirts"]]) {
    assert.equal(productInterestSchema.safeParse({ ...base, choices }).success, true);
  }
  for (const choices of [[], ["socks", "socks"], ["socks", "skirts", "dress_pants"], ["unknown"]]) {
    assert.equal(productInterestSchema.safeParse({ ...base, choices }).success, false);
  }
});

test("el límite permite desmarcar para cambiar la elección", () => {
  const selected = toggleProductInterest(["dress_pants"], "skirts");
  assert.deepEqual(toggleProductInterest(selected, "socks"), ["dress_pants", "skirts"]);
  const changed = toggleProductInterest(selected, "dress_pants");
  assert.deepEqual(toggleProductInterest(changed, "socks"), ["skirts", "socks"]);
});

test("valida identidad y origen sin aceptar datos personales adicionales", () => {
  assert.equal(productInterestSchema.safeParse({ ...base, choices: ["socks"], visitorId: "bad" }).success, false);
  assert.equal(productInterestSchema.safeParse({ ...base, choices: ["socks"], placement: "checkout" }).success, false);
  assert.equal(productInterestSchema.safeParse({ ...base, choices: ["socks"], email: "test@example.test" }).success, false);
});
