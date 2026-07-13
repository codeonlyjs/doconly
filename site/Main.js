import { router, fetchJsonAsset, registerFetchAssetHandler } from "@codeonlyjs/core";
import { initApp, DocumentPage, ErrorPage, LayoutDocumentation, TocPanel } from "@codeonlyjs/stdapp";
import "./content.js";

let tocPanel = new TocPanel();

router.register({
    match: async (to) => {

        try
        {
            // Get the url to fetch
            let fetchUrl = `/content${to.url.pathname}`
            if (fetchUrl.endsWith("/"))
                fetchUrl += "index";
            fetchUrl += ".json";

            // Fetch it and check status
            let page = await fetchJsonAsset(fetchUrl);

            // Create page
            to.page = new DocumentPage(page.html);
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
    // Content passed from SSG
    if (options?.content)
    {
        registerFetchAssetHandler((url) => {
            if (options.content[url] !== undefined)
                return { json: options.content[url] }
        });
    }

    // Fetch TOC
    fetchJsonAsset("/content/toc.json").then(toc => tocPanel.toc = toc);

    // Init ap
    initApp(Object.assign({
        logoUrl: "/content/logo.svg",
        name: "Los Angeles",
        description: "LA is Cool",
    }, options));
}
