import 'dotenv/config';
import { Client, Intents } from 'discord.js';
import * as readline from 'readline';
let guilds: any[] = [];
const client = new Client({intents: [Intents.FLAGS.GUILDS]});
let index = 0;
client.login(process.env['token']);
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
client.on('ready', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_, guild] of client.guilds.cache.entries()) {
        const temp: any = {};
        temp.id = guild.id;
        temp.name = guild.name;
        temp.memberCount = guild.memberCount;
        temp.joinedAt = guild.joinedAt;
        temp.owner = await (await guild.fetchOwner()).displayName;
        guilds.push(temp);
    }
    guilds = guilds.reverse();
    process.stdout.write(JSON.stringify(guilds[index], null, 2));
});
process.stdin.on('keypress', (_, key) => {
    if(key.sequence === '\u0003') {
        //ctrl+c
        process.exit();
    }
    else if(key.name == 'right') {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        index++;
        process.stdout.write(JSON.stringify(guilds[index], null, 2));
    }
    else if(key.name == 'left') {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        index--;
        process.stdout.write(JSON.stringify(guilds[index], null, 2));

    }
    else if(key.name == 'delete') {
        const guild = client.guilds.cache.get(guilds[index].id);
        guild?.leave().then(() => console.log('Left guild ', guild.name));
    }

});
