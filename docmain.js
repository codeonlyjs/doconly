import { router, fetchTextAsset } from "@codeonlyjs/core";
import { initApp, MarkdownPage, ErrorPage, LayoutDocumentation, TocPanel } from "@codeonlyjs/stdapp";

let tocPanel = new TocPanel();

import(router.externalize("/content/toc.js")).then((m) => {
    tocPanel.toc = m.data.toc;
});

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

            // Create page
            to.page = new MarkdownPage(md);
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


export function docmain(options)
{
    initApp(Object.assign({
        logoUrl: "/content/logo.svg",
    }, options));
}