# DocOnly

DocOnly is a simple CodeOnlyJS based documentation browser.  

You give it markdown and images, DocOnly gives you full site with:

* header
* dark/light mode
* automatic table of contents
* automatic in-page header links
* automatic "on this page" navigation
* syntax highlighting
* live reload dev mode server
* builds to a standalone bundle
* built site is statically generated for easy hosting on any file server
* built site is pre-rendered and search crawler compatible
* built site includes entire content in initial download for fast page switching (no further web requests)
* output bundle can be placed in any public `/subpath` url and will still work (ie: it's relocatable)
* tiny size - about 100k + content


## Development Server

The development server includes live reload and works on any folder with markdown files and related assets.

To run the dev server on the current folder:

```bash
npx codeonlysj/doconly
```

To run the dev server on a specific folder:

```bash
npx codeonlysj/doconly ./docs
```

## Building for Production

To deploy your site, bundle it.

```bash
npx codeonlys/doconly --build
```

By deafult the site is built to a `./dist` sub-folder.  Use `--out` to specify output folder:

```bash
npx codeonlysj/doconly --build --out:../mainsite/docs
```

Note the build step doesn't clean the output folder, but it will create it if it doesn't exist.  Normally
you should manually delete the output folder, before running a build.


## Using a `package.json`

To simplify development, you can use a `package.json` file.

1. Create your project folder
2. Create the following `package.json` file in the project root

    ```json
    {
        "scripts": {
            "prod": "npm run build && (cd dist && serve)",
            "dev": "doconly content",
            "build": "rm -rf dist && doconly content --build --out:dist"
        },
        "dependencies": {
            "@codeonlyjs/doconly": "github:codeonlyjs/doconly",
            "serve": "^14.2.6"
        }
    }
    ```

3. Create a `content` sub-folder and place your content in it
4. In the project root, run `npm install` to install the tools
5. Use the following commands:
     - `npm run dev` - run development server
     - `npm run build` - build the deployment bundle to `./dist`
     - `npm run prod` - build and run a simple file server


## Other Options

These command line options are also available:

* `--build` - build output bundle
* `--out:<dir>` - sets the output directory for the built bundle
* `--terser:no` - disables minification of the bundled scripts (for easier debugging)
* `--show-config` - shows server configuration when running dev server
* `--port:N` - sets the dev server port
* `--help` - displays command line help
* `--version` - displays version information



## Authoring Content

Authoring content is mostly just about writing markdown files.  DocOnly will walk 
the directory structure building a table of contents and automatically extracting
headings to build in-page navigation.

There are a couple of additional configurations available however.

### Site Settings

In the root folder's index.md file you can add front matter to define site settings:

```markdown
---
site:
    name: My Site
    description: My Site is Awesome
    logo: MySite.svg
---

# Welcome to My Site
```

The site `name` is used in the main header and the site's social meta tags
The `description` is used in the site's social meta data
The `logo` is used in the main header and the site's social meta tags


### Page Settings

The following page settings are available:

```
title: My Awesome Page
sort: -1
```

The `title` is used for the web page title and in social meta tags.  If not specified
the text of the first heading on the page is used, or the file name.

The `sort` field allows control of sorting in the table of contents.  By default all
pages have a sort index of 0 and pages are sorted by increasing sort order and then 
alphabetically.


### Folder Settings

The `index.md` file of a sub-folder can have the following settings:

```
folder:
    title: "My Sub-Folder"
    sort: -1
```

The `title` is used as the title of this folder in the table of contents.

The `sort` field controls the sort order of this folder the the table of contents.


## License

Apache 2.0 - see [LICENSE](LICENSE)
