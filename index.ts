import { ButtonInteraction, Client, CommandInteraction, GuildMember, Intents, InteractionReplyOptions, MessageActionRow, MessageButton, SelectMenuInteraction, VoiceChannel } from 'discord.js';
import { ActivityTypes } from 'discord.js/typings/enums';
import 'dotenv/config';
import { RadioPlayer } from './RadioPlayer';
import RadiYo from './RadiYo';
import { VoiceManager } from './VoiceManager';
import logger from './util/logger';

const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES],
    presence: {activities: [{name: 'the radio!', type: ActivityTypes.LISTENING}]}
});
//TODO: This station spammed metadata changes, investigate "Positively The Biggest Hits From The 00's"
client.on('interactionCreate', async interaction => {
    if(!interaction.guild || !interaction.channel) {
        logger.debug('Could not find guild or channel.');
        interaction.user.send('This bot will not work in DMs');
        return;
    }
    if(interaction.isCommand()) {
        logger.info(`${interaction.user.username + '#' + interaction.user.discriminator} issued command ${interaction.options.getSubcommand() +' ' + getCmdOptions(interaction)} in Guild ${interaction.guild.name}`, {'interaction': interaction});
        if(interaction.commandName === 'radio') {
            let vm: VoiceManager | null;
            if(interaction.options.getSubcommand() === 'play') {
                await interaction.deferReply();
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
                        logger.error('Error while searching for station', err);
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
                const topSongs = await RadioPlayer.getTopSongs();
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
                if(topSongs) {
                    const template = RadiYo.nowPlayingListEmbed(topSongs);
                    const embed = template.embed.setTitle('Popular Songs Playing Now');
                    await interactionSend(interaction, {embeds: [embed], components: [template.component], ephemeral: true});
                }

            }
            else if(interaction.options.getSubcommand() === 'search') {
                interaction.deferReply({ephemeral: true});
                const searchCategory = interaction.options.getString('category') ? interaction.options.getString('category') : 'choice_artist';
                const searchQuery = interaction.options.getString('query');
                if(searchQuery) {
                    let searchResults;
                    let template = null;
                    if(searchCategory === 'choice_artist') {
                        searchResults = await RadioPlayer.searchByArtist(searchQuery, 5);
                        console.log(searchResults);
                        if(searchResults !== null) {
                            template = RadiYo.nowPlayingListEmbed(searchResults);
                        }
                        else {
                            interactionSend(interaction, `No results found for ${searchQuery}`);
                            return;
                        }
                    }
                    else {
                        searchResults = await RadioPlayer.searchByStation(searchQuery, 5);
                        if(searchResults && searchResults.length) {
                            template = RadiYo.stationListEmbed(searchResults);
                        }
                        else {
                            interactionSend(interaction, `No results found for ${searchQuery}`);
                            return;
                        }
                    }
                    if(template) {
                        const responseMessage = template.embed
                            .setTitle(`Search Results for ${searchQuery}`);
                        interaction.editReply({embeds: [responseMessage], components: [template.component]});
                    }
                    else {
                        logger.error('There was an error generating template. Template: ', template);
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
            else if(interaction.options.getSubcommand() === 'help') {
                const embed = RadiYo.newMsgEmbed().setTitle('Thank you for using RadiYo!')
                    .setDescription('RadiYo! let\'s you play internet radio stations in voice channels. For help or support, visit our website or Discord server.');
                const row = new MessageActionRow().addComponents(
                    new MessageButton()
                        .setStyle('LINK')
                        .setLabel('Invite to server')
                        .setURL('https://discord.com/api/oauth2/authorize?client_id=895354013116153876&permissions=3147840&scope=bot%20applications.commands'),
                    new MessageButton()
                        .setStyle('LINK')
                        .setLabel('Website')
                        .setURL('https://radiyobot.com/?utm_source=about_cmd'),
                    new MessageButton()
                        .setStyle('LINK')
                        .setLabel('Support Server')
                        .setURL('https://discord.gg/s8nqYm76Xa')
                );
                interaction.reply({embeds: [embed], components: [row]});
            }
        }
    }
    else if(interaction.isButton()) {
        logger.info(`${interaction.user.username} pressed ${interaction.customId} in ${interaction.guild.name} guild`);
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
        logger.info(`${interaction.user.username} used ${interaction.customId} select menu. Selecting ${interaction.values[0]}`);
        if(interaction.customId === 'choose_station') {
            let vm: VoiceManager | null;
            const vc = await checkVoiceChannel(interaction);
            if(!vc) return;
            let station;
            try {
                station = await RadioPlayer.searchByStationId(interaction.values[0]);
            }
            catch(err) {
                logger.error('There was an error while searching for station by id', err);
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
        logger.info(`Leaving channel in ${vm.GUILD.name} due to empty voice channel`);
        vm.leaveVoiceChannel();
    }

});

client.on('guildCreate', (guild) => {
    logger.info(`New guild has been added: ${guild.name} with ${guild.memberCount} members. Total guild count: ${client.guilds.cache.size}`);
});

client.on('guildDelete', (guild) => {
    logger.info(`${guild.name} has kicked RadiYo! Total member count: ${client.guilds.cache.size}`);
});

client.login(RadiYo.DISCORD_TOKEN);
RadiYo.CLIENT = client;
if(process.env.NODE_ENV !== 'development'){RadiYo.downloadFeaturedStations();}
logger.info('Logged in!');

function exitHandler() {
    logger.info('Exiting...');
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

function getCmdOptions(interaction: CommandInteraction) : string {
    let string = '';
    const opts = interaction.options.data[0].options;
    if(opts){
        opts.forEach((option) => {
            string += ' ' + option.value;
        });
    }
    return string;
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