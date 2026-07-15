import { clargs, showArgs, showPackageVersion } from "@toptensoftware/clargs";

import { runServer } from "./server.js";
import { runBuild } from "./build.js";

function showVersion()
{
    showPackageVersion(path.join(__dirname, "package.json"));
}

function showHelp()
{
    showVersion();

    console.log("\nUsage: npx codeonlyjs/doconly <options> [dir]");

    console.log("\nOptions:");
    showArgs({
        "--build": "Build toc.json and content.json",
        "--out": "Directory to write build files",
        "<dir>": "Root content directory"
    });
}

let cl = {
    contentDir: ".",
    outDir: ".",
    terser: true,
};
let args = clargs();
while (args.next())
{
    switch (args.name)
    {
        case "build":
            cl.build = true;
            break;

        case "out":
            cl.outDir = args.readValue();
            break;

        case "show-config":
            cl.showConfig = args.readBoolValue();
            break;

        case "terser":
            cl.terser = args.readBoolValue();
            break;

        case "p":
        case "port":
            cl.port = args.readIntValue();
            break;

        case "v":
        case "version":
            showVersion();
            process.exit(0);

        case "h":
        case "help":
            showHelp();
            process.exit(0);

        case null:
            cl.contentDir = args.readValue();
            break;

        default:
            console.log(`Unknown command line option '${args.name}'`);
            process.exit(7);
    }
}


if (cl.build)
{
    await runBuild(cl);
}
else
{
    runServer(cl);
}