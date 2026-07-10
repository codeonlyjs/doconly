import url from 'node:url';
import path from "node:path";
import merge from "deepmerge";
import { serve } from "@codeonlyjs/coserv";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

let contentDir = path.join(process.cwd());
let siteDir = path.join(__dirname, "site");

let config = 
{
    baseDir: siteDir,
    serve: [
        { 
            // Serve markdown files, throw error if not found
            url: "/content", 
            path: contentDir, 
            fallthrough: false,
        },
        { 
            // Serve site, fallback to spa if not found
            url: "/", 
            path: siteDir,
            extensions: [ 'html' ],
            spa: true,
        },
    ],
    development: {
        modules: [ 
            "@codeonlyjs/core",
            "@codeonlyjs/stylish",
            "@codeonlyjs/stdapp",
            "@codeonlyjs/doconly",
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
    }
};

config = merge.all([
    config,
    config[process.env.NODE_ENV ?? "development"] ?? {},
], { arrayMerge: (d, s, opt) => s });



serve(config);