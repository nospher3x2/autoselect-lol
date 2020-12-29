import LCUConnector from 'lcu-connector';
import readline from 'readline';
import axios, { AxiosInstance } from 'axios';
import https from 'https';

const connector = new LCUConnector();
const IAsk = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

var running = false;
var credentials = undefined;
const result = {
    ban: undefined,
    select: undefined
}

const selectChampion = async(champion: any)=> {
    const api = new ClientAPI();

    const session = await api.getChampionSelectSession();
    if(!session) return;
    const localCellId = session.localPlayerCellId;

    session.actions.forEach(async(_session)=> {
        _session.forEach(async(action: any)=> {
            if (action.actorCellId != localCellId) return; 
            const actionId = action.id;

            return await api.lockChampion(champion.itemId, actionId);
        });
    });
}

const run = async()=> {
    if(!running) return;

    const api = new ClientAPI();

    const phases = {
        "ChampSelect": async()=> {
            const session = await api.getChampionSelectSession();
            if(!session) return;

            if(session.timer.phase.includes("PLAINING")) {
                await new Promise((resolve)=> setTimeout(()=> resolve, 1000));
                return await selectChampion(result.select)
            }

            const banActions = session.actions[0].filter((action: any)=> action.type === 'ban' && action.completed);
            return banActions.length < session.bans.numBans ? await selectChampion(result.ban) : await selectChampion(result.select);
        }
    }

    const phase = await api.getGameflowPhase();
    return phases[phase] ? phases[phase]() : undefined;
}

const start = async()=> {
    const client = new ClientAPI();
    const store = new StoreAPI(await client.getRsoAuth(), await client.getStoreUrl());

    const champions: any = await store.getChampions().catch(()=> undefined);
    if(!champions) return await start();
    
    console.log(`\nAvailable champions:\n`)
    champions.catalog.forEach((champion: any)=> console.log(`${champion.name}`));

    const bannedChampion = await ask(`\nInput champion name (BAN)`);
    const championToBan = champions.catalog.filter((_champion)=> _champion.name.toLowerCase().includes(String(bannedChampion).toLowerCase()))[0];
    if(!championToBan) return console.log(`Not founded this champion to ban. Restart program`);
    result.ban = championToBan;

    const selectedChampion = await ask(`Input champion name (LOCK)`);
    const championToPick =  champions.catalog.filter((_champion)=> _champion.name.toLowerCase().includes(String(selectedChampion).toLowerCase()))[0];
    if(!championToPick) return console.log(`Not founded this champion to lock. Restart program`);
    result.select = championToPick;

    console.log('\nSelected champions, waiting join to champion select.');
    running = true;
    setInterval(async()=> await run(), 1000);
}

const ask = async(question: string) => new Promise((resolve)=> 
    IAsk.question(`${question}: `, (answer: string)=> resolve(answer))
);

connector.on('connect', async(_credentials: ICredentials)=> {
    credentials = _credentials;
    await start();
});

connector.on('disconnect', ()=> running = false);

connector.start();

class ClientAPI {

    private api: AxiosInstance;

    constructor() {
        const agent = new https.Agent({
            rejectUnauthorized: false,
        });

        this.api = axios.create({
            baseURL: `https://127.0.0.1:${credentials.port}`,
            headers: {
                'content-type': 'application/json',
                'Authorization': `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`)
                .toString("base64")}`,
            },
            httpsAgent: agent
        });
    }

    public async getGameflowPhase() {        
        return await this.api.get('lol-gameflow/v1/gameflow-phase').then((response)=> response.data)
        .catch((error)=> console.log(`[ERROR] » ${error.response.data.message}`));
    }

    public async getChampionSelectSession() {
        return await this.api.get(`lol-champ-select/v1/session`).then((response)=> response.data)
        .catch((error)=> console.log(`[ERROR] » ${error.response.data.message}`));
    }

    public async getStoreUrl() {
        return await this.api.get(`/lol-store/v1/getStoreUrl`).then((response)=> response.data)
        .catch((error)=> console.log(`[ERROR] » ${error.response.data.message}`));
    }

    public async getRsoAuth() {
        return await this.api.get(​'/lol-rso-auth/v1/authorization/access-token')
        .then((response)=> response.data)
        .catch((error)=> console.log(`[ERROR] » ${error}`));
    }

    public async lockChampion(championId: number, id:number) {
        return await this.api.patch(`lol-champ-select/v1/session/actions/${id}`, { championId, "completed": true})
        .catch(()=> undefined);
    } 
}

class StoreAPI {

    private api: AxiosInstance;

    constructor(private readonly rso: any, private readonly storeUrl: string) {
        this.api = axios.create({
            baseURL: storeUrl,
            headers: {
                'User-Agent': 'RiotClient/18.0.0 (rso-auth)',
                'content-type': 'application/json',
                'Authorization': `Bearer ${rso.token}`,
            }
        });
    }

    public async getChampions() {
        return this.api.get('/storefront/v3/view/champions').then((response)=> response.data)
        .catch((error)=> console.log(`[ERROR] » ${error.response.data.message}`));
    }
}

const animatedTitle = async(title: string)=> {
    const chars = title.split('');
    process.title = '';

    chars.forEach((char, index)=> {
        setTimeout(()=> {
            process.title += char;
            if(index+1 >= chars.length) return animatedTitle(title);
        }, 125 * index)
    })
}

animatedTitle(`INSTASELECT LOL @ryannospherys `);
console.log(`\x1b[36mWaiting to start League Client\n`);

interface ICredentials {
    address: string;
    port: number;
    username: string;
    password: string;
    protocol: string;
}