import path from "node:path";
import fs from "node:fs/promises";
import { parseFrontMatter } from "@codeonlyjs/doconly";

export async function buildToc(baseDir, options)
{
    readDir(".");

    async function readDir(dir)
    {
        let fulldir = path.join(baseDir, dir);
        await fs.readdir(fulldir);
        debugger;
    }
}

await buildToc("../LosAngeles");