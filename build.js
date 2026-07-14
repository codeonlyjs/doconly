import path from "node:path";
import url from 'node:url';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

import { rollup } from 'rollup';
import { rollupPluginHTML as html } from '@web/rollup-plugin-html';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import { copy } from '@web/rollup-plugin-copy';
import replace from '@rollup/plugin-replace';

import { buildToc } from "./buildToc.js";
import { buildContent } from "./buildContent.js";
import { buildSiteSettings } from "./buildSiteSettings.js";
import { generateStatic } from '@codeonlyjs/core';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Custom rollup plugin to provide the content of content.js
function content(options)
{
    return {
        name: 'doconly-content',
        async load(id) 
        {
            if (id == path.join(__dirname, "site", "content.js"))
            {
                let toc = await buildToc(options.contentDir);
                let siteSettings = await buildSiteSettings(options.contentDir);
                let content = await buildContent(options.contentDir);
                options.content = content;
                let js = `
import { registerFetchAssetHandler } from "@codeonlyjs/core";

export const toc = ${JSON.stringify(toc)};
export const siteSettings = ${JSON.stringify(siteSettings)};
const content = ${JSON.stringify(content)};

registerFetchAssetHandler((url) => {
    if (content[url] !== undefined)
        return { json: content[url] }
});
`;
                options.contentJsSource = js;
                return js;
            }
        }
    };
}

// Custom rollup plugin to run static site generator
function ssg(options)
{
    return {
        name: 'ssg',
        async generateBundle(opts, bundle)
        {
            // Find the generated index.html asset
            const htmlAsset = Object.values(bundle).find(
                f => f.type === 'asset' && f.fileName == "index.html"
            );

            // Check found
            if (!htmlAsset) 
            {
                this.warn('index.html asset not found in bundle, SSG abandoned');
                return;
            }

            // Get HTML source
            const entryHtml = typeof htmlAsset.source === 'string'
                ? htmlAsset.source
                : Buffer.from(htmlAsset.source).toString('utf-8');

            // Install node hook to provide custom content.js file
            // with the site's, site settings and toc
            let contentJsPath = path.join(__dirname, "site", "content.js");
            let contentJsUrl = pathToFileURL(contentJsPath).href;
            const hook = registerHooks({
                resolve(specifier, context, nextResolve) 
                {
                    return nextResolve(specifier, context); // let default resolution run
                },
                load(url, context, nextLoad) 
                {
                    if (url === contentJsUrl)
                    {
                        return {
                            format: 'module',
                            shortCircuit: true,
                            source: options.contentJsSource,
                        };
                    }
                    return nextLoad(url, context);
                },
            });

            // Generate static content
            let generated = await generateStatic({
                entryFile: path.join(__dirname, "site", "Main.js"),
                entryHtml,
                entryParams: [{
                    content: options.content,
                }],
            });

            // Remove hook
            hook.deregister();

            // Add (or update) generated files to the bundle
            for (let g of generated.files)
            {
                let assetName = g.url;
                if (assetName.startsWith("./"))
                    assetName = assetName.substring(2);
                const existing = bundle[assetName];

                if (existing && existing.type === 'asset') 
                {
                    existing.source = g.content;
                }
                else 
                {
                    this.emitFile({
                        type: 'asset',
                        fileName: assetName,
                        source: g.content
                    });
                }
            }
        }
    };
}


// Run a build!
export async function runBuild(options) 
{
    // Locate the site template
    let siteDir = path.join(__dirname, "site");

    // Remap any direct /module urls to /node_modules
    const rawHtml = readFileSync(path.join(siteDir, 'index.html'), 'utf8');
    const mappedHtml = rawHtml.replace(/\/modules/g, '../node_modules/');

    // Run roll up
    const bundle = await rollup({
        plugins: [
            html({
                input: { html: mappedHtml, name: 'index.html' },
                rootDir: siteDir,
                publicPath: '/',
            }),
            content(options),
            resolve({
                preferBuiltins: false,
                browser: true,
                rootDir: siteDir,
            }),
            replace({
                preventAssignment: true,
            }),
            commonjs(),
            terser(),
            ssg(options),
            copy({
                patterns: '**/*.{png,jpg,jpeg,gif,svg,webp,ico,css,js}',
                rootDir: options.contentDir,
            }),
        ],
    });

    // Write bundle
    await bundle.write({
        dir: path.resolve(options.outDir),
        format: 'es',
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
    });

    // Done!
    await bundle.close();
}

