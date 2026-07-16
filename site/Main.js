import { router, UrlMapper, fetchJsonAsset, registerFetchAssetHandler } from "@codeonlyjs/core";
import { initApp, DocumentPage, ErrorPage, LayoutDocumentation, TocPanel } from "@codeonlyjs/stdapp";
import { toc, siteSettings } from "./content.js";

// Auto subpath mapper
const url = new URL(import.meta.url);
if (url.protocol === "http:" || url.protocol === "https:") 
{
    const parts = url.pathname.split("/"); // pathname starts with "/"
    const assetsIndex = parts.indexOf("assets");
    if (assetsIndex > 0)
    {
        let subpath = parts.slice(0, assetsIndex).join("/") + "/";
        router.urlMapper = new UrlMapper({
            base: subpath
        });
    }
}

function getTocPanel()
{
    if (coenv.tocPanel == null)
        coenv.tocPanel = new TocPanel(toc);
    return coenv.tocPanel;
}

router.register({
    match: async (to) => {

        try
        {
            // Get the url to fetch
            let fetchUrl = `${to.url.pathname}`
            if (fetchUrl.endsWith("/"))
                fetchUrl += "index";
            fetchUrl += ".json";

            // Fetch it and check status
            let page = await fetchJsonAsset(fetchUrl);

            // Create page
            to.page = new DocumentPage(page.html);
            to.page.layout = LayoutDocumentation;
            to.page.primaryNavigation = getTocPanel();
            to.title = page.title;
            return true;
        }
        catch (err)
        {
            to.page = new ErrorPage({
                title: `Unexpected Error!`,
                message: err.message,
            })
            to.page.layout = LayoutDocumentation;
            to.page.primaryNavigation = getTocPanel();
            return true;
        }
    }
});


export function main(options)
{
    // Default options
    options = Object.assign({
    }, options);

    // Content passed during from SSG generation
    if (options?.content)
    {
        // Setup content handler
        registerFetchAssetHandler((url) => {
            if (options.content[url] !== undefined)
                return { json: options.content[url] }
        });
    }

    // Init ap
    initApp(Object.assign(siteSettings, options));
}
