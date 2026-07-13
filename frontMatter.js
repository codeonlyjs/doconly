import YAML from 'yaml';

export function parseFrontMatter(markdown)
{
    markdown = markdown.replace(/\r\n|\r/g, '\n')
    // Extract front matter
    let frontMatter = null;
    markdown = markdown.replace(/^---([\s\S]*?)---\n/, (m, m1) => {
        frontMatter = m1.trim();
        return "";
    });

    let data = null;
    if (frontMatter)
    {
        // Try as JSON then as YAML
        try
        {
            data = JSON.parse(frontMatter);
        }
        catch
        {
            data = YAML.parse(frontMatter);
        }
    }
    
    if (!data)
        data = {};

    if (!data.title)
    {
        let rxHeading = /^#{1,6}[ \t]+(.+?)(?:\s*\{[^}]*\})?\s*$/m;
        let m = markdown.match(rxHeading);
        if (m)
            data.title = m[1];
    }

    return {
        markdown,
        frontMatter,
        data,
    }
}