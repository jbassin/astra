import { expect, test } from "vitest";

import { handleHealth } from "./health";

test("GET /health answers ok", async () => {
  const res = handleHealth(new Request("http://127.0.0.1:10203/health"));
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("ok\n");
});

test("the retired speak route is gone", () => {
  const res = handleHealth(
    new Request("http://127.0.0.1:10203/api/v1/speak", { method: "POST", body: "{}" }),
  );
  expect(res.status).toBe(404);
});
