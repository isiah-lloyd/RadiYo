
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from '@discordjs/builders';
import RadiYo from './RadiYo';


const commands: unknown = [ 
    new SlashCommandBuilder().setName('radio')
        .setDescription('Play a radio station in voice channel')
        .addSubcommand(() => {
            return new SlashCommandSubcommandBuilder().setName('play')  
                .setDescription('Play a radio station')      
                .addStringOption(option => {
                    return option.setName('query')
                        .setDescription('Play a station from an artist or station name')
                        .setRequired(true);
                });
        })
        .addSubcommand(() => {
            return new SlashCommandSubcommandBuilder().setName('search')
                .setDescription('Search for a station by name, genre, or currently playing artist/song!')
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
            await rest.put(
                Routes.applicationGuildCommands(RadiYo.DISCORD_OAUTH_CLIENT_ID, RadiYo.DISCORD_GUILD_ID),
                { body: commands },
            );
        }
        console.log('Successfully deployed slash commands.');
    } catch (error) {
        console.error(error);
    }
})();