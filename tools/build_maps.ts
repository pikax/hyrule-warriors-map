import fs from "fs-extra";
import {resolve} from "path";


const root = resolve(__dirname, '../static');

const mapDir = resolve(root, 'maps');


const ensureDirMaps = async (map: string): Promise<string>=>{
    await fs.ensureDir(resolve(mapDir, map));
    await fs.ensureDir(resolve(mapDir, map, 'tile'));
    return map;
};





const run = ()=>{
    const maps = require('../static/maps.json');

    return Promise.all(maps.map(ensureDirMaps));
};




run();

