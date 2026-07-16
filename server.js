import url from 'node:url';
import path from "node:path";
import fs from "node:fs/promises";
import merge from "deepmerge";
import { serve } from "@codeonlyjs/coserv";
import { parseFrontMatter } from './frontMatter.js';
import { buildToc } from './buildToc.js';
import { renderPage } from "./renderPage.js";
import { buildSiteSettings } from './buildSiteSettings.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export function runServer(options)
{
    let contentDir = path.join(path.resolve(options?.contentDir ?? "."));
    let siteDir = path.join(__dirname, "site");

    let handlers = [
        { 
            // Serve markdown files, throw error if not found
            url: "/content", 
            path: contentDir, 
            fallthrough: false,
        },
        { 
            // Serve other files, fallthrough if not found
            url: "/", 
            fallthrough: true,
            path: contentDir, 
        },
        { 
            // Serve site, fallback to spa if not found
            url: "/", 
            path: siteDir,
            extensions: [ 'html' ],
            spa: true,
        },
    ]; 

    async function handleContentJS(req, res, next)
    {
        let toc = await buildToc(contentDir);
        let siteSettings = await buildSiteSettings(contentDir);

        let js = `// Generated on demand by doconly dev server
export const siteSettings = ${JSON.stringify(siteSettings, null, 4)};
export const toc = ${JSON.stringify(toc, null, 4)};
`;

        res.type('application/javascript')
        res.send(js);
    }

    async function handleStylesCSS(req, res, next)
    {
        let stylesFile = path.join(contentDir, "styles.css");

        try
        {
            // If file exists, send t
            await fs.stat(stylesFile);
            res.sendFile(stylesFile);
        }
        catch (err)
        {
            if (err.code == "ENOENT")
            {
                // Otherwise, send empty file
                res.type('text/css')
                res.send("");
            }
            else
                next(err);
        }
    }

    async function handleContent(req, res, next)
    {
        if (!req.url.endsWith(".json"))
            return next();

        // Read markdown file
        let markdown;
        try
        {
            let filePath = path.join(contentDir, req.url.slice(0, -5) + ".md");
            markdown = await fs.readFile(filePath, "utf8");
        }
        catch (err)
        {
            if (err.code == "ENOENT")
                next();
            throw err;
        }

        // Render it
        let page = renderPage(markdown);
        res.json(page);
    }

    let config = 
    {
        baseDir: siteDir,
        development: {
            serve: [
                { url: "/content.js", handler: handleContentJS },
                { url: "/styles.css", handler: handleStylesCSS},
                { url: "/", handler: handleContent },
                ...handlers
            ],
            modules: [ 
                "@codeonlyjs/core",
                "@codeonlyjs/stylish",
                "@codeonlyjs/stdapp",
            ],
            replace: [
                { from: "./Main.js", to: "/Main.js" },
            ],
            livereload: {
                extraExts: [ "md" ],
            },
            watch: [
                contentDir
            ],
        },
        production: {
            serve: handlers
        }
    };

    config = merge.all([
        config,
        config[process.env.NODE_ENV ?? "development"] ?? {},
    ], { arrayMerge: (d, s, opt) => s });

    serve(config);
}