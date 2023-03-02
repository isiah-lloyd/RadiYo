import { ButtonInteraction, Client, CommandInteraction, Guild, GuildMember, Intents, Interaction, InteractionReplyOptions, MessageActionRow, MessageButton, Options, SelectMenuInteraction, TextBasedChannel, TextChannel, VoiceChannel } from 'discord.js';
import { ActivityTypes } from 'discord.js/typings/enums';
import 'dotenv/config';
import { RadioPlayer } from './RadioPlayer';
import RadiYo from './RadiYo';
import { VoiceManager } from './VoiceManager';
import logger from './util/logger';
import * as URL from 'url';
import { generateDependencyReport } from '@discordjs/voice';
import { Station } from './util/interfaces';

const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES],
    presence: { activities: [{ name: 'the radio!', type: ActivityTypes.LISTENING }] },
    makeCache: Options.cacheWithLimits({
        MessageManager: {
            maxSize: 20,
            sweepInterval: 43200
        }
    })
});
//TODO: This station spammed metadata changes, investigate "Positively The Biggest Hits From The 00's"
client.on('interactionCreate', async interaction => {
    if (!interaction.guild || !interaction.channel) {
        logger.debug('Could not find guild or channel.');
        interaction.user.send('This bot will not work in DMs');
        return;
    }
    if (interaction.isCommand()) {
        logger.info(`${interaction.user.username + '#' + interaction.user.discriminator} issued ${interaction.toString()} in Guild ${interaction.guild.name}`, { 'interaction': interaction });
        if (interaction.commandName === 'radio') {
            let vm: VoiceManager | null;
            if (interaction.options.getSubcommand() === 'play') {
                await interaction.deferReply();
                const searchQuery = interaction.options.getString('query');
                if (searchQuery === 'admin' && interaction.user.id === RadiYo.ADMIN_ID) {
                    adminCenter(interaction);
                    return;
                }
                if (searchQuery) {
                    const vc = await checkVoiceChannel(interaction);
                    if (!vc) return;
                    const url = isUrl(searchQuery);
                    let station;
                    if (url) {
                        logger.info(`Could not find station for ${searchQuery}, using URL suggestions for hostname ${url.hostname}`);
                        if (['youtube.com', 'spotify.com', 'soundcloud.com'].some(x => url.hostname.includes(x))) {
                            interactionSend(interaction, 'RadiYo! does not play music from Youtube, Spotify, or other websites. Instead it plays music from internet radio stations. Try playing a station using an artist name or /radio browse');
                            return;
                        }
                        const streamString = url.toString();
                        station = {
                            text: streamString,
                            subtext: streamString,
                            streamDownloadURL: streamString
                        } as Station
                    }
                    else {
                        try {
                            station = await RadioPlayer.searchOne(searchQuery);
                        }
                        catch (err) {
                            interactionSend(interaction, 'There was an error while searching for a station. Please try again later.');
                            logger.error('Error while searching for station', err);
                            return;
                        }
                    }
                    if (!station || !station.streamDownloadURL) {
                        logger.info(`Could not find station: ${searchQuery}, attempting to find station based off reco2`);
                        const searchResult = await RadioPlayer.recommendStations(searchQuery, 1, true);
                        if (searchResult && searchResult.length > 0) {
                            station = searchResult[0];
                        }
                        else {
                            logger.info(`Could not find station for ${searchQuery}`);
                            interactionSend(interaction, { content: `Could not find station for "${searchQuery}". Either that station doesn't exist in our directory yet or the artist isn't currently playing.` });

                        }
                    }
                    if (station) {
                        createVoiceManager(interaction.guild, interaction.channel, vc, station, interaction);
                    }
                }
            }
            else if (interaction.options.getSubcommand() === 'browse') {
                const featuredStations = RadiYo.getFeaturedStations();
                const topSongs = await RadioPlayer.getTopSongs();
                for (const category of featuredStations) {
                    //pick 5 random stations from each category
                    const randomStations = category.stations.sort(() => 0.5 - Math.random()).slice(0, 5);
                    const template = RadiYo.stationListEmbed(randomStations);
                    const embed = template.embed.setTitle(category.title).setDescription(category.description);
                    if (!interaction.replied) {
                        await interaction.reply({ embeds: [embed], components: [template.component], ephemeral: true });
                    }
                    else {
                        await interaction.followUp({ embeds: [embed], components: [template.component], ephemeral: true });
                    }
                }
                if (topSongs) {
                    const template = RadiYo.nowPlayingListEmbed(topSongs);
                    const embed = template.embed.setTitle('Popular Songs Playing Now');
                    await interactionSend(interaction, { embeds: [embed], components: [template.component], ephemeral: true });
                }

            }
            else if (['asearch', 'stsearch', 'gsearch'].includes(interaction.options.getSubcommand())) {
                interaction.deferReply({ ephemeral: true });
                const searchQuery = interaction.options.getString('query');
                const searchCategory = interaction.options.getSubcommand();
                if (searchQuery) {
                    let searchResults;
                    let template = null;
                    if (searchCategory === 'asearch') {
                        searchResults = await RadioPlayer.searchByArtist(searchQuery, 5);
                        if (searchResults !== null) {
                            template = RadiYo.nowPlayingListEmbed(searchResults);
                        }
                        else {
                            logger.info(`Could not find station for ${searchQuery}`);
                            interactionSend(interaction, `No results found for ${searchQuery}`);
                            return;
                        }
                    }
                    else if (searchCategory === 'stsearch') {
                        searchResults = await RadioPlayer.searchByStation(searchQuery, 5);
                        if (searchResults && searchResults.length) {
                            template = RadiYo.stationListEmbed(searchResults);
                        }
                        else {
                            logger.info(`Could not find station for ${searchQuery}`);
                            interactionSend(interaction, { content: `Could not find station for "${searchQuery}"` });
                            return;
                        }
                    }
                    else if (searchCategory === 'gsearch') {
                        searchResults = await RadioPlayer.searchByGenre(searchQuery, 5);
                        if (searchResults && searchResults.length) {
                            template = RadiYo.nowPlayingListEmbed(searchResults);
                        }
                        else {
                            logger.info(`Could not find station for ${searchQuery}`);
                            interactionSend(interaction, `No results found for ${searchQuery}`);
                            return;
                        }
                    }
                    if (template) {
                        const responseMessage = template.embed
                            .setTitle(`Search Results for ${searchQuery}`);
                        interaction.editReply({ embeds: [responseMessage], components: [template.component] });
                    }
                    else {
                        logger.error('There was an error generating template. Template: ', template);
                        interactionSend(interaction, 'There was an error searching.');
                    }
                }
            }
            else if (interaction.options.getSubcommand() === 'stop') {
                vm = RadiYo.getVoiceManager(interaction.guild);
                if (vm) {
                    if (vm.isUserInVC(interaction.user)) {
                        vm.leaveVoiceChannel();
                        interaction.reply(`Leaving #${vm.VOICE_CHANNEL.name}`);
                    }
                    else {
                        interaction.reply({ content: 'You must be in the voice channel to stop the groove!', ephemeral: true });
                    }
                }
                else {
                    interaction.reply('You can\'t stop something of which hasn\'t been started!');
                }
            }
            else if (interaction.options.getSubcommand() === 'help') {
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
                        .setURL('https://discord.gg/aQ4sZ9cJcb')
                );
                interaction.reply({ embeds: [embed], components: [row] });
            }
        }
    }
    else if (interaction.isButton()) {
        logger.info(`${interaction.user.username} pressed ${interaction.customId} in ${interaction.guild.name} guild`);
        const vm = RadiYo.getVoiceManager(interaction.guild);
        if (interaction.customId === 'stop_stream') {
            if (vm) {
                if (vm.isUserInVC(interaction.user)) {
                    interaction.reply(`${interaction.user} has stopped the stream`);
                    vm.leaveVoiceChannel();
                }
                else {
                    logger.info(`${interaction.user.username} is not allowed to stop stream`);
                    interaction.reply({ content: 'You must be in the voice channel to stop the groove!', ephemeral: true });
                }
            }
            else {
                // Stop button was not edited out of ended stream. Remove useless button
                logger.info(`${interaction.user.username} is pressed a useless button.`);
                const embed = interaction.message.embeds[0];
                interaction.update({ embeds: [embed], components: [] });
            }


        }
    }
    else if (interaction.isSelectMenu()) {
        logger.info(`${interaction.user.username} used ${interaction.customId} select menu. Selecting ${interaction.values[0]}`);
        if (interaction.customId === 'choose_station') {
            const vc = await checkVoiceChannel(interaction);
            if (!vc) return;
            let station;
            try {
                station = await RadioPlayer.searchByStationId(interaction.values[0]);
            }
            catch (err) {
                logger.error('There was an error while searching for station by id', err);
                interactionSend(interaction, 'There was an error while getting that station, please try again later.');
                return;
            }
            if (station && station.streamDownloadURL) {
                createVoiceManager(interaction.guild, interaction.channel, vc, station, interaction);
            }

        }
    }
    else if (interaction.isAutocomplete()) {
        const query = interaction.options.getFocused();
        if (interaction.options.getSubcommand() === 'play') {
            if (typeof query === 'string') {
                const opts = await RadioPlayer.getAutocomplete(query);
                if (opts) {
                    interaction.respond(opts.filter(x => x.keyword).map((x) => ({ name: x.keyword, value: x.keyword })));
                }
            }
        }
        else if (interaction.options.getSubcommand() === 'stsearch') {
            if (typeof query === 'string') {
                const opts = await RadioPlayer.getAutocomplete(query);
                if (opts) {
                    interaction.respond(opts.filter(x => x.keyword).filter(x => x.type === 'S').map((x) => ({ name: x.keyword, value: x.keyword })));
                }
            }
        }
        else if (interaction.options.getSubcommand() === 'asearch') {
            if (typeof query === 'string') {
                const opts = await RadioPlayer.getAutocomplete(query);
                if (opts) {
                    interaction.respond(opts.filter(x => x.keyword).filter(x => x.type === 'A').map((x) => ({ name: x.keyword, value: x.keyword })));
                }
            }
        }
    }
});
client.on('voiceStateUpdate', (_, newState) => {
    const vm = RadiYo.getVoiceManager(newState.guild);
    if (vm && vm.getMembersInChannel() === 0) {
        vm.sendLeavingMsg();
        logger.info(`Leaving channel in ${vm.GUILD.name} due to empty voice channel`);
        vm.leaveVoiceChannel();
    }

});

client.on('guildCreate', (guild) => {
    logger.info(`New guild has been added: ${guild.name} with ${guild.memberCount} members. Total guild count: ${client.guilds.cache.size}`);
});

client.on('guildDelete', (guild) => {
    const vm = RadiYo.getVoiceManager(guild);
    vm?.leaveVoiceChannel();
    logger.info(`${guild.name} has kicked RadiYo! Total guild count: ${client.guilds.cache.size}`);
});

client.login(RadiYo.DISCORD_TOKEN);
RadiYo.CLIENT = client;
if (process.env.NODE_ENV !== 'development') { RadiYo.downloadFeaturedStations(); }
client.on('ready', async () => {
    console.log(generateDependencyReport());
    logger.info('Logged in!');
});

function exitHandler() {
    logger.info('Exiting...');
    RadiYo.VOICE_MANAGERS.forEach((voiceMgr) => {
        voiceMgr.leaveVoiceChannel();
    });
    client.destroy();
    process.exit();
}
/**
 * Checks if user is in voice channel and if bot has perms to join it, sends msg to user if not.
 * @param interaction
 * @returns voice channel if in one, otherwise `false`
 */
async function checkVoiceChannel(interaction: CommandInteraction | SelectMenuInteraction): Promise<VoiceChannel | false> {
    const gm: GuildMember | undefined = await interaction.guild?.members.cache.get(interaction.user.id);
    if (gm instanceof GuildMember) {
        if (gm.voice.channel && gm.voice.channel instanceof VoiceChannel) {
            if (!gm.voice.channel.permissionsFor(RadiYo.getBotUser())?.has('CONNECT')) {
                interactionSend(interaction, `I don't have permission to join ${gm.voice.channel}`);
                return false;
            }
            return gm.voice.channel;
        }
        else {
            logger.info(`${interaction.user.username} is not in a voice channel, not starting stream.`);
            interactionSend(interaction, 'You must be in a voice channel to play the radio!');
            return false;
        }
    }
    return false;
}
function interactionSend(interaction: CommandInteraction | ButtonInteraction | SelectMenuInteraction, args: string | InteractionReplyOptions) {
    if (interaction.deferred) {
        interaction.editReply(args);
        return;
    }
    if (interaction.replied) {
        interaction.followUp(args);
    }
    else {
        interaction.reply(args);
    }
}

function checkIfHaveWritePerm(interaction: Interaction) {
    if (interaction.channel?.isText() && interaction.guild?.me) {
        const cnl = interaction.channel as TextChannel;
        if (cnl.permissionsFor(interaction.guild.me).has('SEND_MESSAGES')) {
            return true;
        }
        else {
            logger.info(`I don't have permission to send messages in #${cnl.name} in guild ${interaction.guild.name}`);
            return false;
        }
    }
    else {
        return false;
    }
}
function isUrl(str: string) {
    try {
        return new URL.URL(str);
    } catch {
        return false;
    }
}
function adminCenter(interaction: CommandInteraction) {
    let radioPlayStatus = 'Radio Players:\nStation Title | Listener Count';
    RadiYo.RADIO_PLAYERS.forEach(player => {
        radioPlayStatus += `\n ${player.CURRENT_STATION.text} | ${player.listenerCount('metadataChange')}`;

    });
    let voiceManagerStatus = 'Voice Managers\nStation | Guild | Time | Members';
    RadiYo.VOICE_MANAGERS.forEach(manager => {
        voiceManagerStatus += `\n ${manager.STATION.text} | ${manager.GUILD.name} | ${manager.getElapsedTime()} | ${manager.getMembersInChannel()} (${manager.maxMembers})`;
    });
    interaction.followUp(radioPlayStatus);
    interaction.followUp(voiceManagerStatus);
}
async function createVoiceManager(
    guild: Guild,
    channel: TextBasedChannel,
    vc: VoiceChannel,
    station: Station,
    interaction: CommandInteraction | ButtonInteraction | SelectMenuInteraction
): Promise<VoiceManager> {
    const vm = await RadiYo.createVoiceManager(guild, channel, vc, station);
    if (!checkIfHaveWritePerm(interaction)) {
        logger.info(`Cannot send notification in Guild ${guild}`);
        interactionSend(
            interaction,
            "I don't have permission to send messages in this chanel so I won't be able to show the currently playing song. Ask an Admin to let me send messages!"
        );
    }
    interactionSend(interaction, await vm.getCurrentStationEmbed());
    return vm;
}
/* function getCmdOptions(interaction: CommandInteraction) : string {
    let string = '';
    const opts = interaction.options.data[0].options;
    if(opts){
        opts.forEach((option) => {
            string += ' ' + option.value;
        });
    }
    return string;
} */
//do something when app is closing
//process.on('exit', exitHandler);

//catches ctrl+c event
process.on('SIGINT', exitHandler);

// catches "kill pid" (for example: nodemon restart)
//process.on('SIGUSR1', exitHandler);
//process.on('SIGUSR2', exitHandler);

//catches uncaught exceptions
//process.on('uncaughtException', exitHandler);