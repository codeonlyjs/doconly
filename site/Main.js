import { router, fetchTextAsset, fetchJsonAsset } from "@codeonlyjs/core";
import { initApp, MarkdownPage, ErrorPage, LayoutDocumentation, TocPanel } from "@codeonlyjs/stdapp";
import { parseFrontMatter } from "@codeonlyjs/frontmatter";

let tocPanel = new TocPanel();

fetchJsonAsset("/content/toc.json").then(toc => tocPanel.toc = toc);

router.register({
    match: async (to) => {

        try
        {
            // Get the url to fetch
            let fetchUrl = `/content${to.url.pathname}`
            if (fetchUrl.endsWith("/"))
                fetchUrl += "index";
            fetchUrl += ".md";

            // Fetch it and check status
            let md = await fetchTextAsset(fetchUrl);
            let fm = parseFrontMatter(md);

            // Create page
            to.page = new MarkdownPage(fm.markdown);
            to.page.layout = LayoutDocumentation;
            to.page.primaryNavigation = tocPanel;
            return true;
        }
        catch (err)
        {
            to.page = new ErrorPage({
                title: `Unexpected Error!`,
                message: err.message,
            })
            to.page.layout = LayoutDocumentation;
            to.page.primaryNavigation = tocPanel;
            return true;
        }
    }
});


export function main(options)
{
    initApp(Object.assign({
        logoUrl: "/content/logo.svg",
        name: "Los Angeles",
        description: "LA is Cool",
    }, options));
}
