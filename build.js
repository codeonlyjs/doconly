import fs from "node:fs/promises";
import path from "node:path";
import { buildToc } from "./buildToc.js";
import { buildContent } from "./buildContent.js";
import { stringTag } from "yaml/util";

export async function runBuild(options)
{  
    // Build
    let toc = await buildToc(options.contentDir, options);
    let content = await buildContent(options.contentDir, options);

    // Create directory
    await fs.mkdir(options.outDir, { recursive: true });

    // Write 
    await fs.writeFile(path.join(options.outDir, "toc.json"), JSON.stringify(toc, null, 4), "utf8");
    await fs.writeFile(path.join(options.outDir, "content.json"), JSON.stringify(content, null, 4), "utf8");
}