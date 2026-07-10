import YAML from 'yaml';

export function parseFrontMatter(markdown)
{
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

    return {
        markdown,
        frontMatter,
        data,
    }
}