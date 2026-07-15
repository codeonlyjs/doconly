import path from "node:path";
import fs from "node:fs/promises";
import { parseFrontMatter } from "./frontMatter.js";
import { readdirWithStat } from "./utils.js";

export async function buildToc(baseDir, options)
{
    return (await readDir(".")).children;

    async function readDir(dir)
    {
        let folderToc = {};
        let children = [];

        let fulldir = await readdirWithStat(path.join(baseDir, dir));
        for (let f of fulldir)
        {
            // Directory?
            if (f.stat.isDirectory())
            {
                children.push(await readDir(path.join(dir, f.name)));
                continue;
            }

            // Markdown?
            if (f.name.endsWith(".md"))
            {
                // Parse front matter
                let e = parseFrontMatter(await fs.readFile(path.join(baseDir, dir, f.name), "utf8"));

                // Work out web url
                let url;
                if (f.name == "index.md")
                {
                    if (dir == ".")
                        url = "/";
                    else
                        url = "/" + dir + "/";

                    e.data.sort = -1000;

                    // Assign folder settings
                    if (e.data.folder)
                        Object.assign(folderToc, e.data.folder);
                }
                else
                {
                    url = "/" + path.join(dir, f.name.slice(0, -3));
                }
                
                if (e.markdown.trim() == "")
                    continue;

                // Add entry
                children.push({
                    title: e.data.title ?? f.name.slice(0, -3),
                    url: url.replace(/\\/g, "/"),
                    sort: parseInt(e.data.sort ?? 0),
                });
            }
        }

        children.sort((a, b) => (a.sort??0) - (b.sort??0) || a.title.localeCompare(b.title))
        children.forEach(x => delete x.sort);
        folderToc.children = children;

        if (!folderToc.title)
            folderToc.title = path.basename(path.join(baseDir, dir));

        return folderToc;
    }
}
