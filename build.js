import { rollup } from 'rollup';
import { rollupPluginHTML as html } from '@web/rollup-plugin-html';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import { copy } from '@web/rollup-plugin-copy';
import replace from '@rollup/plugin-replace';
import { readFileSync } from 'fs';

import fs from "node:fs/promises";
import path from "node:path";
import url from 'node:url';
import { buildToc } from "./buildToc.js";
import { buildContent } from "./buildContent.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function content(options)
{
    return {
        name: 'doconly-content',
        async load(id) 
        {
            if (id == path.join(__dirname, "site", "content.js"))
            {
                let toc = await buildToc(options.contentDir);
                let content = await buildContent(options.contentDir);
                content["/content/toc.json"] = toc;
                let js = `
import { registerFetchAssetHandler } from "@codeonlyjs/core";

const content = ${JSON.stringify(content)};

registerFetchAssetHandler((url) => {
    if (content[url] !== undefined)
        return { json: content[url] }
});
`;
                return js;
            }
        }
    };
}


export async function runBuild(options) 
{
    let siteDir = path.join(__dirname, "site");
  // Remap any direct /module urls to /node_modules
  const rawHtml = readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  const mappedHtml = rawHtml.replace(/\/modules/g, '../node_modules/');

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
      }),
      replace({
        preventAssignment: true,
      }),
      commonjs(),
      terser(),
      copy({
        patterns: './public/**/*',
      }),
    ],
  });

  await bundle.write({
    dir: path.resolve(options.outDir),
    format: 'es',
    entryFileNames: 'assets/[name]-[hash].js',
    chunkFileNames: 'assets/[name]-[hash].js',
    assetFileNames: 'assets/[name]-[hash][extname]',
  });

  await bundle.close();
}

