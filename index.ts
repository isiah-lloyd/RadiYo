import 'dotenv/config';
import { Client, GuildMember, Intents, MessageEmbed, VoiceChannel } from 'discord.js';
import RadiYo from './RadiYo';
import { VoiceManager } from './VoiceManager';
import { RadioPlayer } from './RadioPlayer';

const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES]});
//TODO: This station spammed metadata changes, investigate "Positively The Biggest Hits From The 00's"
client.on('interactionCreate', async interaction => {
    if(interaction.isCommand()) {
        if(interaction.commandName === 'radio') {
            if(!interaction.guild || !interaction.channel) {
                throw new Error('Could not retrieve guild or channel');
            }
            let vm: VoiceManager | null;
            if(interaction.options.getSubcommand() === 'play') {
                const gm: GuildMember | undefined = await interaction.guild.members.cache.get(interaction.user.id);
                const searchQuery = interaction.options.getString('station');
                if(gm?.voice.channel && gm.voice.channel instanceof VoiceChannel && searchQuery) {
                    vm = RadiYo.createVoiceManager(interaction.guild, interaction.channel, gm.voice.channel);
                    const station = await RadioPlayer.searchOne(searchQuery);
                    if(station && station.streamDownloadURL) {
                        vm.attachPlayer(station);
                        interaction.reply({embeds: [vm.getCurrentStationEmbed()]});
                    }
                    else {
                        interaction.reply(`Could not find station: ${searchQuery}`);
                    }
                }
                else {
                    interaction.reply('You must be in a voice channel to play the radio!');
                }
            }
            else if(interaction.options.getSubcommand() === 'search') {
                interaction.deferReply({ephemeral: true});
                const searchQuery = interaction.options.getString('query');
                if(searchQuery) {
                    const searchResults = await RadioPlayer.search(searchQuery);
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
                        const responseMessage = new MessageEmbed()
                            .setAuthor('RadiYo!')
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
        console.log('STub');
    }
});
client.on('voiceStateUpdate', (_, newState) => {
    const vm = RadiYo.getVoiceManager(newState.guild);
    if (vm && vm.VOICE_CHANNEL.members.size === 1) {
        vm.NOTIFICATION_CHANNEL.send(`I'm all alone! Leaving #${vm.VOICE_CHANNEL.name}`);
        vm.leaveVoiceChannel();
    } 

});
client.login(RadiYo.DISCORD_TOKEN);
console.log('Logged in!');
