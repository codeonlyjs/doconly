import path from "node:path";
import fs from "node:fs/promises";
import { parseFrontMatter } from "./frontMatter.js";

export async function buildSiteSettings(baseDir)
{
    try
    {
        let filePath = path.join(baseDir, "index.md");
        let fm = parseFrontMatter(await fs.readFile(filePath, "utf8"));
        let siteSettings = Object.assign({}, fm.data.site);
        if (siteSettings.logo)
        {
            if (siteSettings.logo.indexOf("://") < 0 && !siteSettings.logo.startsWith("/"))
                siteSettings.logo = "/" + siteSettings.logo;
            siteSettings.logoUrl = siteSettings.logo;
            delete siteSettings.logo;
        }
        if (!siteSettings.name)
            siteSettings.name = path.basename(path.resolve(baseDir));
        return siteSettings;
    }
    catch (err)
    {
        if (err.code == "ENOENT")
        {
            return {
                name: "index.md not found",
            }
        }
        else
            throw err;
    }
}