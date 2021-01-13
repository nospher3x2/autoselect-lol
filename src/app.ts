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

animatedTitle(`AUTOSELECT LOL @ryannospherys `);
console.log(`\x1b[36mWaiting to start League Client\n`); 

const selectChampion = async(credentials: ICredentials, champion: any)=> {
    const api = new ClientAPI(credentials);
    const session = await api.getChampionSelectSession();
    if(!session) return;

    const localCellId = session.localPlayerCellId;
    return session.actions.forEach(async(actions: any)=> {
        const action = actions.filter((action: any)=> action.actorCellId === localCellId)[0]
        if(!action) return;

        return await api.selectChampion(champion.itemId, action.id);
    })
}

const run = async(credentials: ICredentials, champions: any)=> {
    if(!running) return;
    const api = new ClientAPI(credentials);

    const phases = {
        "ChampSelect": async()=> {
            const session = await api.getChampionSelectSession();
            if(!session) return;

            const selectTurn = session.actions[0][0].completed
            return selectTurn ? await selectChampion(credentials, champions.select) : await selectChampion(credentials, champions.ban)
        }
    }

    const phase = await api.getGameflowPhase();
    return phases[phase] ? phases[phase]() : undefined;
}

const askBanAndSelect = async(credentials: ICredentials)=> {
    const client = new ClientAPI(credentials);

    const rso = await client.getRsoAuth();
    const storeUrl = await client.getStoreUrl();

    const store = new StoreAPI(rso, storeUrl);
    const champions = await store.getChampions();
    champions.catalog.forEach((champion)=> console.log(champion.name))

    const ban = await ask(`\nInput champion name (to ban)`).then(async(champion)=> {
        const championToBan = champions.catalog.filter((_champion)=> _champion.name.toLowerCase().includes(String(champion).toLowerCase()))[0];
        if(!championToBan) {
            console.log(`Champion not found, input correct name`);
            return await askBanAndSelect(credentials);
        }

        return championToBan;
    });

    const select = await ask(`Input champion name (to select)`).then(async(champion)=> {
        const championToSelect = champions.catalog.filter((_champion)=> _champion.name.toLowerCase().includes(String(champion).toLowerCase()))[0];
        if(!championToSelect) {
            console.log(`Champion not found, input correct name`);
            return await askBanAndSelect(credentials);
        }

        return championToSelect;
    });

    console.log(`Champions selected, waiting join in champion select. `);
    return { ban, select };
}

const ask = async(question: string) => new Promise((resolve)=> 
    IAsk.question(`${question}: `, (answer: string)=> resolve(answer))
);

connector.on('connect', async(credentials: ICredentials)=> {
    console.log('League Client started.')
    running = true;
    const champions = await askBanAndSelect(credentials);
    setInterval(async()=> await run(credentials, champions), 2000);
});

connector.on('disconnect', ()=> running = false);

connector.start();

class ClientAPI {

    private api: AxiosInstance;

    constructor(credentials: ICredentials) {
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

    public async selectChampion(championId: number, id:number) {
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

interface ICredentials {
    address: string;
    port: number;
    username: string;
    password: string;
    protocol: string;
}
