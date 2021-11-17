
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from '@discordjs/builders';
import RadiYo from './RadiYo';
import { ApplicationCommandPermissionData, Client, Intents } from 'discord.js';


const commands = [ 
    new SlashCommandBuilder().setName('radio')
        .setDescription('Play a radio station in voice channel')
        .addSubcommand(() => {
            return new SlashCommandSubcommandBuilder().setName('play')  
                .setDescription('Play a station from an artist or station name')      
                .addStringOption(option => {
                    return option.setName('query')
                        .setDescription('<artist|song|station name>')
                        .setRequired(true);
                });
        })
        .addSubcommand(() => {
            return new SlashCommandSubcommandBuilder().setName('browse')
                .setDescription('Discover new stations and find something right for the mood');
        })
        .addSubcommand(() => {
            return new SlashCommandSubcommandBuilder().setName('search')
                .setDescription('Search for a station by name, genre, or currently playing artist/song')
                .addStringOption(option => {
                    return option.setName('query')
                        .setDescription('<name|genre|artist|song>')
                        .setRequired(true);
                });

        })
        .addSubcommand(() => {
            return new SlashCommandSubcommandBuilder().setName('stop')
                .setDescription('Stops the music and leaves the voice channel');
        })
        
        
].map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(RadiYo.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started deploying slash commands.');
        if(process.argv[2] === '--global') {
            console.log('Deploying commands globally');
            await rest.put(Routes.applicationCommands(RadiYo.DISCORD_OAUTH_CLIENT_ID), {body: commands});
        }
        else {
            console.log('Deploying commands to guild');
            commands[0].default_permission = false;
            await rest.put(
                Routes.applicationGuildCommands(RadiYo.DISCORD_OAUTH_CLIENT_ID, RadiYo.DISCORD_GUILD_ID),
                { body: commands },
            );
            console.log('Successfully deployed slash commands.');
            const client = new Client({intents: [Intents.FLAGS.GUILDS]});
            client.login();
            client.on('ready', async () => {
                const guild = await client.guilds.cache.get(RadiYo.DISCORD_GUILD_ID)?.fetch();
                const cmds = await guild?.commands.fetch();
                const perm1: ApplicationCommandPermissionData = {
                    id: '179705637649776640',
                    type: 'USER',
                    permission: true
                };
                const perm2: ApplicationCommandPermissionData = {
                    id: '905569260108132393',
                    type: 'USER',
                    permission: true
                };
                cmds?.forEach((el) => {
                    console.log(`Mod perms for ${el.name}`);
                    el.permissions.add({permissions: [perm1,perm2]});
                });
                process.exit(0);
            });
        }
    } catch (error) {
        console.error(error);
    }
})();