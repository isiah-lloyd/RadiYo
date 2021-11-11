import { Client, GuildMember, Intents, VoiceChannel } from 'discord.js';
import { ActivityTypes } from 'discord.js/typings/enums';
import 'dotenv/config';
import { RadioPlayer } from './RadioPlayer';
import RadiYo from './RadiYo';
import { VoiceManager } from './VoiceManager';

const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES],
    presence: {activities: [{name: 'the radio!', type: ActivityTypes.LISTENING}]}
});
//TODO: This station spammed metadata changes, investigate "Positively The Biggest Hits From The 00's"
client.on('interactionCreate', async interaction => {
    if(!interaction.guild || !interaction.channel) {
        console.debug('Could not find guild or channel.');
        interaction.user.send('This bot will not work in DMs');
        return;
    }
    if(interaction.isCommand()) {
        if(interaction.commandName === 'radio') {
            let vm: VoiceManager | null;
            if(interaction.options.getSubcommand() === 'play') {
                const gm: GuildMember | undefined = await interaction.guild.members.cache.get(interaction.user.id);
                const searchQuery = interaction.options.getString('query');
                if(gm?.voice.channel && gm.voice.channel instanceof VoiceChannel && searchQuery) {
                    if(!gm.voice.channel.permissionsFor(RadiYo.getBotUser())?.has('CONNECT')) {
                        interaction.reply(`I don't have permission to join ${gm.voice.channel}`);
                        return;
                    }
                    interaction.deferReply();
                    let station;
                    try {
                        station = await RadioPlayer.searchOne(searchQuery);
                    }
                    catch(err) {
                        interaction.editReply('There was an error while searching for a station. Please try again later.');
                        console.error(err);
                        return;
                    }
                    if(station && station.streamDownloadURL) {
                        vm = RadiYo.createVoiceManager(interaction.guild, interaction.channel, gm.voice.channel);
                        vm.attachPlayer(station);
                        interaction.editReply({embeds: [vm.getCurrentStationEmbed()]});
                    }
                    else {
                        interaction.editReply(`Could not find station: ${searchQuery}`);
                    }
                }
                else {
                    interaction.reply('You must be in a voice channel to play the radio!');
                }
            }
            else if(interaction.options.getSubcommand() === 'browse') {
                //TODO
            }
            else if(interaction.options.getSubcommand() === 'search') {
                interaction.deferReply({ephemeral: true});
                const searchQuery = interaction.options.getString('query');
                if(searchQuery) {
                    const searchResults = await RadioPlayer.search(searchQuery, 5);
                    const fields = [];
                    if(searchResults) {
                        for(let i = 0; i <= 5; i++) {
                            if(searchResults[i]) {
                                const nameObj = {
                                    name: 'Name',
                                    value: searchResults[i].text,
                                    inline: true
                                };
                                const descObj = {
                                    name: 'Description',
                                    value: searchResults[i].subtext ? searchResults[i].subtext : 'N/A',
                                    inline: true
                                };
                                const genreObj = {
                                    name: 'Genre',
                                    value: searchResults[i].genre ? searchResults[i].genre : 'N/A',
                                    inline: true
                                };
                                fields.push(nameObj, descObj, genreObj);
                            }
                        }
                        const responseMessage = RadiYo.newMsgEmbed()
                            .setTitle(`Search Results for ${searchQuery}`)
                            .addFields(fields);
                        interaction.editReply({embeds: [responseMessage]});
                    }
                }

            }
            else if(interaction.options.getSubcommand() === 'stop') {
                vm = RadiYo.getVoiceManager(interaction.guild);
                if(vm) {
                    vm.leaveVoiceChannel();
                    interaction.reply(`Leaving #${vm.VOICE_CHANNEL.name}`);
                }
                else {
                    interaction.reply('You can\'t stop something of which hasn\'t been started!');
                }
            }
        }
    }
    else if(interaction.isButton()) {
        const vm = RadiYo.getVoiceManager(interaction.guild);
        if(interaction.customId === 'stop_stream') {
            interaction.reply('Stopping stream!');
            vm?.leaveVoiceChannel();
            
        }
    }
});
client.on('voiceStateUpdate', (_, newState) => {
    const vm = RadiYo.getVoiceManager(newState.guild);
    if (vm && vm.VOICE_CHANNEL.members.size === 1 && vm.VOICE_CHANNEL.members.has(RadiYo.getBotUser().id)) {
        vm.NOTIFICATION_CHANNEL.send(`I'm all alone! Leaving #${vm.VOICE_CHANNEL.name}`);
        vm.leaveVoiceChannel();
    } 

});

client.login(RadiYo.DISCORD_TOKEN);
RadiYo.CLIENT = client;
console.log('Logged in!');

function exitHandler() {
    console.debug('Exiting...');
    RadiYo.VOICE_MANAGERS.forEach((voiceMgr) => {
        voiceMgr.leaveVoiceChannel();
    });
    client.destroy();
    process.exit();
}
//do something when app is closing
process.on('exit', exitHandler);

//catches ctrl+c event
process.on('SIGINT', exitHandler);

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler);
process.on('SIGUSR2', exitHandler);

//catches uncaught exceptions
process.on('uncaughtException', exitHandler);