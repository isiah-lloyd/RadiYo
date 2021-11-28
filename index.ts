import { ButtonInteraction, Client, CommandInteraction, GuildMember, Intents, InteractionReplyOptions, SelectMenuInteraction, VoiceChannel } from 'discord.js';
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
                interaction.deferReply();
                const searchQuery = interaction.options.getString('query');
                if(searchQuery) {
                    const vc = await checkVoiceChannel(interaction);
                    if(!vc) return;
                    let station;
                    try {
                        station = await RadioPlayer.searchOne(searchQuery);
                    }
                    catch(err) {
                        interactionSend(interaction, 'There was an error while searching for a station. Please try again later.');
                        console.error(err);
                        return;
                    }
                    if(station && station.streamDownloadURL) {
                        vm = RadiYo.createVoiceManager(interaction.guild, interaction.channel, vc);
                        vm.attachPlayer(station);
                        interactionSend(interaction, {embeds: [vm.getCurrentStationEmbed()]});
                    }
                    else {
                        interactionSend(interaction, `Could not find station: ${searchQuery}`);
                    }
                }
            }
            else if(interaction.options.getSubcommand() === 'browse') {
                const featuredStations = RadiYo.getFeaturedStations();
                for(const category of featuredStations) {
                    const template = RadiYo.stationListEmbed(category.stations);
                    const embed = template.embed.setTitle(category.title).setDescription(category.description);
                    if(!interaction.replied) {
                        await interaction.reply({embeds: [embed], components: [template.component], ephemeral: true});
                    }
                    else {
                        await interaction.followUp({embeds: [embed], components: [template.component], ephemeral: true});
                    }
                }                
            }
            else if(interaction.options.getSubcommand() === 'search') {
                interaction.deferReply({ephemeral: true});
                const searchCategory = interaction.options.getString('category') ? interaction.options.getString('category') : 'choice_artist';
                const searchQuery = interaction.options.getString('query');
                if(searchQuery) {
                    let searchResults;
                    let template;
                    if(searchCategory === 'choice_artist') {
                        searchResults = await RadioPlayer.searchByArtist(searchQuery, 5);
                        if(searchResults && searchResults.length !== 0) {
                            template = RadiYo.nowPlayingListEmbed(searchResults);
                        }
                        else {
                            interactionSend(interaction, `No results found for ${searchQuery}`);
                        }
                    }
                    else {
                        searchResults = await RadioPlayer.search(searchQuery, 5);
                        if(searchResults && searchResults.length) {
                            template = RadiYo.stationListEmbed(searchResults);
                        }
                        else {
                            interactionSend(interaction, `No results found for ${searchQuery}`);
                        }
                    }
                    if(template) {
                        const responseMessage = template.embed
                            .setTitle(`Search Results for ${searchQuery}`);
                        interaction.editReply({embeds: [responseMessage], components: [template.component]});
                    }
                    else {
                        console.error(searchResults);
                        interactionSend(interaction, 'There was an error searching.');
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
            if(vm) {
                interaction.reply(`${interaction.user} has stopped the stream`);
                vm.leaveVoiceChannel();
            }
            else {
                const embed = interaction.message.embeds[0];
                interaction.update({embeds: [embed], components: []});
            }

            
        }
    }
    else if(interaction.isSelectMenu()) {
        if(interaction.customId === 'choose_station') {
            let vm: VoiceManager | null;
            const vc = await checkVoiceChannel(interaction);
            if(!vc) return;
            let station;
            try {
                station = await RadioPlayer.searchByStationId(interaction.values[0]);
            }
            catch(err) {
                console.error(err);
                interactionSend(interaction, 'There was an error while getting that station, please try again later.');
                return;
            }
            if(station && station.streamDownloadURL) {
                vm = RadiYo.createVoiceManager(interaction.guild, interaction.channel, vc);
                vm.attachPlayer(station);
                interactionSend(interaction, {embeds: [vm.getCurrentStationEmbed()]});
            }

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
if(process.env.NODE_ENV !== 'development'){RadiYo.downloadFeaturedStations();}
console.log('Logged in!');

function exitHandler() {
    console.debug('Exiting...');
    RadiYo.VOICE_MANAGERS.forEach((voiceMgr) => {
        voiceMgr.leaveVoiceChannel();
    });
    client.destroy();
    process.exit();
}
async function checkVoiceChannel(interaction: CommandInteraction | SelectMenuInteraction): Promise<VoiceChannel | false> {
    const gmaybe : GuildMember | undefined = await interaction.guild?.members.cache.get(interaction.user.id);
    let gm: GuildMember;
    if(gmaybe instanceof GuildMember) {
        gm = gmaybe;
        if(!gm.voice.channel) {
            interactionSend(interaction, 'You must be in a voice channel to play the radio!');
            return false;
        }
        if(!gm.voice.channel.permissionsFor(RadiYo.getBotUser())?.has('CONNECT')) {
            interactionSend(interaction, `I don't have permission to join ${gm.voice.channel}`);
            return false;
        }
        if(gm.voice.channel instanceof VoiceChannel){
            return gm.voice.channel;
        }
        else {
            interactionSend(interaction, 'You must be in a voice channel to play the radio!');
        }
    }
    return false;
}
function interactionSend(interaction: CommandInteraction | ButtonInteraction | SelectMenuInteraction, args: string | InteractionReplyOptions) {
    if(interaction.deferred) {
        interaction.editReply(args);
        return;
    }
    if(interaction.replied) {
        interaction.followUp(args);
    }
    else {
        interaction.reply(args);
    }
}
//do something when app is closing
//process.on('exit', exitHandler);

//catches ctrl+c event
process.on('SIGINT', exitHandler);

// catches "kill pid" (for example: nodemon restart)
//process.on('SIGUSR1', exitHandler);
//process.on('SIGUSR2', exitHandler);

//catches uncaught exceptions
//process.on('uncaughtException', exitHandler);