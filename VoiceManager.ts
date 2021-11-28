import { DiscordGatewayAdapterCreator, getVoiceConnection, joinVoiceChannel, PlayerSubscription, VoiceConnection } from '@discordjs/voice';
import { EmbedFieldData, Guild, Message, MessageActionRow, MessageButton, MessageEmbed, TextBasedChannels, VoiceChannel } from 'discord.js';
import { decode as htmlDecode } from 'html-entities';
import { RadioPlayer } from './RadioPlayer';
import RadiYo from './RadiYo';
import { NowPlaying, Station } from './util/interfaces';

export class VoiceManager {
    GUILD: Guild;
    NOTIFICATION_CHANNEL: TextBasedChannels;
    VOICE_CHANNEL: VoiceChannel;
    STATION: Station = {} as Station;
    private PLAYER_SUBSCRIPTION: PlayerSubscription | null = null;
    private msg_fifo: Message[] = [];
    private RADIO_PLAYER: RadioPlayer | null = null;
    private boundMetadataFn = this.sendMetadataChange.bind(this);
    private last_msg: MessageEmbed | null = null;
    constructor(guild: Guild, notificationChannel: TextBasedChannels, voiceChannel: VoiceChannel) {
        this.GUILD = guild;
        this.NOTIFICATION_CHANNEL = notificationChannel;
        this.VOICE_CHANNEL = voiceChannel;
        this.joinVoiceChannel();
    }
    private joinVoiceChannel() {
        if(!this.VOICE_CHANNEL) {
            console.error('No voice channel to join');
        }
        else {
            joinVoiceChannel({
                channelId: this.VOICE_CHANNEL.id,
                guildId: this.GUILD.id,
                adapterCreator: this.GUILD.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator
            });
        }
    }
    public attachPlayer(station: Station): boolean {
        if (this.PLAYER_SUBSCRIPTION) this.playerUnsubscribe(); 
        try {
            this.RADIO_PLAYER = RadiYo.getRadioPlayer(station);
        }
        catch(err) {
            console.error(err);
            this.NOTIFICATION_CHANNEL.send('There was an error while trying to stream this station, please try another one.');
            this.leaveVoiceChannel();
            return false;
        }
        const playerHolder = this.getVoiceConnection()?.subscribe(this.RADIO_PLAYER.PLAYER);
        if(playerHolder) {
            this.PLAYER_SUBSCRIPTION = playerHolder;
            this.STATION = station;
            this.RADIO_PLAYER.on('metadataChange', this.boundMetadataFn);
            this.RADIO_PLAYER.on('error', this.audioPlayerError.bind(this));
            return true;
        }
        else {
            console.error('Could not attach player to voice connection');
            return false;
        }

    }
    public leaveVoiceChannel(): void {
        this.playerUnsubscribe();
        this.getVoiceConnection()?.destroy();
        const lastMsg = this.msg_fifo[this.msg_fifo.length -1];
        if(lastMsg) {
            const responseMessage = new MessageEmbed(lastMsg.embeds[0])
                .setTitle('Previously Played');
            lastMsg.edit({embeds: [responseMessage], components: []});
        } 
        RadiYo.deleteVoiceManager(this.GUILD.id);
    }
    public getVoiceConnection() : VoiceConnection | undefined {
        return getVoiceConnection(this.GUILD.id);
    }
    public getCurrentStationEmbed(): MessageEmbed {
        return RadiYo.newMsgEmbed()
            .setTitle(`Now Playing ${this.STATION.text} in #${this.VOICE_CHANNEL.name}`)
            .setDescription(htmlDecode(this.STATION.subtext))
            .setThumbnail(this.STATION.image)
            .setFields({name: 'Genre', value: this.STATION.genre})
            .setFooter('Search powered by onrad.io');
    }
    private playerUnsubscribe(): void {
        this.RADIO_PLAYER?.removeListener('metadataChange', this.boundMetadataFn);
        this.RADIO_PLAYER?.removeListener('error', this.audioPlayerError);
        if(this.PLAYER_SUBSCRIPTION instanceof PlayerSubscription) {
            console.debug('A Player subscription was found, unsubscribing.');
            this.PLAYER_SUBSCRIPTION.unsubscribe();
            this.PLAYER_SUBSCRIPTION = null;
        }
    }
    private audioPlayerError(error: string): void {
        this.NOTIFICATION_CHANNEL.send(error);
        this.leaveVoiceChannel();
    }
    private async sendMetadataChange(song: NowPlaying | string): Promise<void> {
        //todo: check if metadata is empty before sending
        if(song !== null) {
            let responseMessage: MessageEmbed | null = null;
            if(typeof song !== 'string') {
                const fields: EmbedFieldData[] = [];
                if(this.last_msg?.fields[1] && this.last_msg?.fields[1].value == song.title) return;
                if(song.artist === '' && song.title === '') return;
                if(song.artist !== '') fields.push({name: 'Artist', value: song.artist});
                if(song.title !== '') fields.push({name: 'Song', value: song.title});
                responseMessage = RadiYo.newMsgEmbed()
                    .setTitle('Now Playing')
                    .setThumbnail(song.albumArtUrl)
                    .addFields(fields);
            }
            else {
                if(this.last_msg?.description == song) return;
                if(song !== '') {
                    responseMessage = RadiYo.newMsgEmbed()
                        .setTitle('Now Playing')
                        .setDescription(song);
                }
            }
            const row = new MessageActionRow().addComponents(
                new MessageButton()
                    .setCustomId('stop_stream')
                    .setLabel('Stop')
                    .setStyle('DANGER')
            );
            if(responseMessage){
                this.last_msg = responseMessage;
                this.msg_fifo.push(await this.NOTIFICATION_CHANNEL.send({embeds: [responseMessage], components: [row]}));
            }
        }
        if(this.msg_fifo.length > 1) {
            const previousMsg = this.msg_fifo[this.msg_fifo.length - 2];
            const responseMessage = new MessageEmbed(previousMsg.embeds[0])
                .setTitle('Previously Played');
            previousMsg.edit({embeds: [responseMessage], components: []});
        }
        if(this.msg_fifo.length == 7) {
            this.msg_fifo.shift()?.delete();
        }
    }
}