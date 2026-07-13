import path from "node:path";
import fs from "node:fs/promises";
import { parseFrontMatter } from "./frontMatter.js";
import { readdirWithStat } from "./utils.js";
import { renderPage } from "./renderPage.js";

export async function buildContent(baseDir, options)
{
    let content = {};

    await processDir(".");

    return content;

    async function processDir(dir)
    {
        let fulldir = await readdirWithStat(path.join(baseDir, dir));
        for (let f of fulldir)
        {
            // Directory?
            if (f.stat.isDirectory())
            {
                await processDir(path.join(dir, f.name));
                continue;
            }

            // Markdown?
            if (f.name.endsWith(".md"))
            {
                // Render the page
                let page = renderPage(await fs.readFile(path.join(baseDir, dir, f.name), "utf8"));

                // Work out public url
                let url = "/content/" + path.join(dir, f.name.slice(0, -3) + ".json");
                url = url.replace(/\\/g, "/");
                
                content[url] = page;
            }
        }
    }
}
