import { test } from "node:test";
import { strict as assert } from "node:assert";

import { parseFrontMatter } from "./frontMatter.js";

test("None", () => {
    let r = parseFrontMatter(`markdown`);
    assert.deepStrictEqual(r, {
        markdown: "markdown",
        frontMatter: null,
        data: null,
    });
});


test("Empty", () => {
    let r = parseFrontMatter(`---
---
markdown`);
    assert.deepStrictEqual(r, {
        markdown: "markdown",
        frontMatter: "",
        data: null,
    });
});

test("JSON", () => {
    let r = parseFrontMatter(`---
{
    "apples": "red",
    "oranges": "orange"
}
---
markdown`);
    assert.deepStrictEqual(r, {
        markdown: "markdown",
        frontMatter: `{
    \"apples\": \"red\",
    \"oranges\": \"orange\"
}`,
        data: { apples: "red", oranges: "orange"},
    });
});

test("YAML", () => {
    let r = parseFrontMatter(`---
apples: red
oranges: orange
---
markdown`);
    assert.deepStrictEqual(r, {
        markdown: "markdown",
        frontMatter: `apples: red
oranges: orange`,
        data: { apples: "red", oranges: "orange"},
    });
});

