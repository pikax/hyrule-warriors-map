import cheerio from 'cheerio';
import {readFile} from 'fs-extra'
import {stringify} from "querystring";

interface IGameSpotPage {
    href: string,

    mapName: string,

    hasItems: boolean,
    hasSearchImages: boolean,


}

interface IMapLocation {
    col: string,
    row: string
}

interface IItem {
    iconSrc: string;
    name: string;
    description: string;

    locations: IMapLocation[],
}

const adventurePage: IGameSpotPage = {
    href: 'https://gamefaqs.gamespot.com/3ds/167257-hyrule-warriors-legends/faqs/73095/adventure-map',
    mapName: "Adventure",
    hasItems: true,
    hasSearchImages: true,
};


const n3dsImage = 'https://gamefaqs.akamaized.net/faqs/95/73095-150.png';
const nSwitchImage = 'https://gamefaqs.akamaized.net/faqs/95/73095-151.png';

const pages: IGameSpotPage[] = [];


const parseLocationsCell = (cell?: CheerioElement): IMapLocation[] | any => {
    if (!cell) {
        return [];
    }

    const children = cell.firstChild.tagName === "p"
        ? cell.firstChild.children
        : cell.children;


    return children.filter(x => x.tagName === "a")
        .map(x => x.firstChild.nodeValue)
        .map(x => x.split('-'))
        .map(x => ({
            col: x[0],
            row: x[1]
        }));
};

const parseItemRow = (i: number, row: CheerioElement) => {
    const cols = row.children.filter(x => x.tagName === 'td');

    const iconCell = cols[0];
    const nameCell = cols[1];
    const descriptionCell = cols[2];
    const locationCell = cols.length > 3 && cols[3] || undefined;


    const iconSrc = iconCell.firstChild.attribs.src;
    const name = nameCell.firstChild.nodeValue;
    const description = descriptionCell.firstChild.nodeValue;

    const locations = parseLocationsCell(locationCell);

    return {
        iconSrc,
        name,
        description,
        locations
    };


};

const parseItems = ($: CheerioStatic) => {
    const table = $('#faqwrap > table').first();
    const rows = table.find('tbody > tr').slice(1);

    const items = rows.map(parseItemRow).toArray();

    return items;
};

const parseSearchHintStrong = (strong: CheerioElement) => {
    // check if is only for 3DS and ignore it
    if (strong.firstChild.tagName === "img"
        && strong.firstChild.attribs.src === n3dsImage
        && strong.lastChild.nodeValue.indexOf("ONLY") >= 0) {
        return null;
    }
    const type = strong.lastChild.nodeValue.slice(0, -1);
    const hint = strong.next.nodeValue.trimLeft();

    return {type, hint}
};

const parseSearchHint = (el: CheerioElement) => {
    if (el.next.tagName === "strong") {
        return parseSearchHintStrong(el.next);
    }

    const txt = el.next.nodeValue.split(': ');

    const type = txt[0];
    const hint = txt.slice(1).join(': ');

    return {
        type,
        hint
    }
};

// search HTML TD is such a mess in this case
const parseBrokenSearch = (strong: CheerioElement) => {
    const image = strong.firstChild.tagName === "img" && strong.firstChild.attribs.src || null;

    const type = strong.lastChild.nodeValue.slice(0, -1);
    const hint = strong.next.nodeValue.trimLeft();

    return {
        image,
        type,
        hint
    }
};

const parseSearch = (i: number, el: CheerioElement) => {
    if (el.lastChild.nodeValue === 'None') {
        return {};
    }
    if (el.firstChild.tagName === "strong") {
        return parseBrokenSearch(el.firstChild);
    }

    const imgs = el.children.filter(x => x.tagName === 'img');
    const brs = el.children.filter(x => x.tagName === 'br');

    const image = imgs.length > 0
        ? imgs[0].attribs.src
        : null;

    const hints = brs.map(parseSearchHint);

    return {image, hints}
};


const processTDLine = (el: CheerioElement) => {
    if (el.type === "text") {
        return el.data;
    }

    if (el.tagName === "img") {
        if (el.attribs.src !== nSwitchImage) {
            return '';
        }
        if (el.attribs.src === nSwitchImage) {
            return el.next.nodeValue;
        }

    }

    const imgs = el.children.filter(x => x.tagName === "img");
    const ns = imgs.filter(x => x.attribs.src === nSwitchImage);
    // if contains image but there is no nintendo switch image
    if (imgs.length > 0 && ns.length === 0) {
        return '';
    }

    if (ns.length > 0) {
        return ns[0].next.nodeValue;
    }
    return el.lastChild.nodeValue;
};

const processTD = (el: CheerioElement): Array<any> => {
    const brs = el.children.filter(x => x.tagName === "br");
    return brs.length > 0
        ? brs.map(x => processTDLine(x.next))
        : [processTDLine(el)]
};

const processRewardText = (txt: string) => {
    let type: string;
    let text: string;
    let character: string;

    if (txt === "None") {
        return {};
    }

    if (txt.indexOf('Item Card') > -1) {
        text = txt.slice(0, -10);
        type = "Item Card";

        return {text, type}
    } else {

        const x = txt.split(" - ");

        type = 'weapon'; //todo change, it can be an outfit as well
        text = x[0];
        character = x[1]
        return {type, text, character};
    }

};

const parseThirdRow = (i: number, el: CheerioElement) => {
    const tds = el.childNodes.filter(x => x.tagName === "td").map(processTD);


    const aRankVictory = tds[0].filter(x => x).map(processRewardText);
    const battleVictory = tds[1].filter(x => x).map(processRewardText);
    const treasure = tds[2].filter(x => x).map(processRewardText);


    return {
        aRankVictory, battleVictory, treasure
    }
};


const parseFourthRow = (i: number, el: CheerioElement) => {
    const tds = el.childNodes.filter(x => x.tagName === "td").map(processTD);


    const aRankKos = tds[0].filter(x => x);
    const aRankTime = tds[1].filter(x => x);
    const aRankDamage = tds[2].filter(x => x);


    return {
        aRankKos, aRankTime, aRankDamage
    }
};


const parseNotes = (ix: number, el: CheerioElement) => {

    if(el.prev.lastChild.lastChild.nodeValue !== "Notes"){
        return {};
    }

    // TODO is not working correctly
    return processTD(el.firstChild);
};


const parseTiles = ($: CheerioStatic) => {

    const titles = $('#faqwrap > h4');

    const tables = $('#faqwrap > table').slice(2);

    const missions = tables.find('tr:nth-child(2) > td').map((i, el) => el.firstChild.nodeValue);
    const searches = tables.find('tr:nth-child(4) > td').map(parseSearch);
    const rewards3 = tables.find('tr:nth-child(6)').map(parseThirdRow);
    const rewards4 = tables.find('tr:nth-child(8)').map(parseFourthRow);

    const notes = tables.find('tr:last-child').map(parseNotes);

    const data = titles.toArray().map((x, i) => ({
        title: x.firstChild.nodeValue,
        mission: missions[i],
        search: searches[i]
    }));


    console.log(notes.toArray());

    console.log({
        titles: titles.length,
        missions: missions.length,
        searches: searches.length,
        rewards3: rewards3.length,
        rewards4: rewards4.length
    })
};


const run = async () => {
    const fp = await readFile('./temp/adventure_map.html');
    const $ = cheerio.load(fp.toString());


    parseItems($);

    parseTiles($);

};


run();



