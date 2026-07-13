import fs from "node:fs/promises";
import path from "node:path";

export async function readdirWithStat(dir)
{
    const names = await fs.readdir(dir);
    return Promise.all(
        names.map(async (name) => {
            const full = path.join(dir, name);
            const stat = await fs.stat(full);
            return { name, stat };
        })
    );
}

