import { Parser, HtmlRenderer } from "commonmark";
import hljs from 'highlight.js';

import { parseFrontMatter } from './frontMatter.js';

class Renderer extends HtmlRenderer
{
    constructor()
    {
        super();
    }

    code_block(node) {

        let attrs = this.attrs(node);

        let code = node.literal;
        let info_words = node.info ? node.info.split(/\s+/) : [];
        if (info_words.length > 0 && info_words[0].length > 0) {
            var language = this.esc(info_words[0]);
            code = hljs.highlight(code, { language }).value;
            attrs.push(["class", "hljs"]);
        }
        else
        {
            code = this.esc(code);
        }

        this.cr();
        this.tag("pre");
        this.tag("code", attrs);
        this.lit(code);
        this.tag("/code");
        this.tag("/pre");
        this.cr();
    }

    attrs(node)
    {
        let att = super.attrs(node);
        if (node.id)
        {
            att.push(["id", node.id]);
        }
        return att;
    }

}

export function renderPage(markdown)
{
    // Parse front matter
    let fm = parseFrontMatter(markdown);

    // Parse Markdown
    let ast = new Parser().parse(fm.markdown);

    // Process {id} suffixes on headings
    let walker = ast.walker();
    let ev;
    while (ev = walker.next())
    {
        // If this is the last text node, look for {#id} suffix
        if (ev.node.parent?.lastChild == ev.node && ev.node.parent.type == "heading")
        {
            ev.node.literal = ev.node.literal.replace(/\s*\{\s*#(.*)\s*\}\s*$/, (text, id) => {
                ev.node.parent.id = id;
                return "";
            });
        }
    }
        
    // Render Markdown
    let html = new Renderer().render(ast);

    return Object.assign(fm.data, { html });
}