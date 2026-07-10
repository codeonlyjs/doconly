// rollup.config.js
import { rollupPluginHTML as html } from '@web/rollup-plugin-html';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import { copy } from '@web/rollup-plugin-copy';
import replace from '@rollup/plugin-replace';
import { readFileSync } from 'fs';

// Remap any direct /module urls to /node_modules 
const rawHtml = readFileSync("./index.html", "utf8");
const mappedHtml = rawHtml.replace(/\/modules/g, "/node_modules/");

export default {
  output: {
    dir: 'dist',
    format: 'es',
    entryFileNames: 'assets/[name]-[hash].js',
    chunkFileNames: 'assets/[name]-[hash].js',
    assetFileNames: 'assets/[name]-[hash][extname]',
  },
  plugins: [
    html({
      input: { html: mappedHtml, name: 'index.html' },
      rootDir: '.',
      publicPath: '/',
    }),
    resolve({ 
      preferBuiltins: false,
      browser: true 
    }),
    replace({
      preventAssignment: true,
    }),
    commonjs(),
    terser(),
    copy({ 
      patterns: './public/**/*' 
    }),
  ],
};