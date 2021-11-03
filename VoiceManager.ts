import { DiscordGatewayAdapterCreator, getVoiceConnection, joinVoiceChannel, PlayerSubscription, VoiceConnection } from '@discordjs/voice';
import { Guild, Message, MessageEmbed, TextBasedChannels, VoiceChannel } from 'discord.js';
import RadiYo from './RadiYo';
import { NowPlaying, Station } from './util/interfaces';
import {decode as htmlDecode} from 'html-entities';

export class VoiceManager {
    GUILD: Guild;
    NOTIFICATION_CHANNEL: TextBasedChannels;
    VOICE_CHANNEL: VoiceChannel;
    STATION: Station = {} as Station;
    private PLAYER_SUBSCRIPTION: PlayerSubscription | null = null;
    private msg_fifo: Message[] = [];
    //private RADIO_PLAYER: RadioPlayer | null = null;
    
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
        const rp = RadiYo.getRadioPlayer(station);
        const playerHolder = this.getVoiceConnection()?.subscribe(rp.PLAYER);
        if(playerHolder) {
            this.PLAYER_SUBSCRIPTION = playerHolder;
            this.STATION = station;
            rp.on('metadataChange', this.sendMetadataChange.bind(this));
            rp.on('error', (err) => {
                this.NOTIFICATION_CHANNEL.send(`There was an error while playing ${station.text}. Error: ${err.message}`);
                this.leaveVoiceChannel();
            });
            return true;
        }
        else {
            console.error('Could not attach player to voice connection');
            return false;
        }

    }
    public leaveVoiceChannel(): void {
        if(this.PLAYER_SUBSCRIPTION instanceof PlayerSubscription) {
            this.PLAYER_SUBSCRIPTION.unsubscribe();
            console.debug('A Player subscription was found, unsubscribing.');
        }
        this.getVoiceConnection()?.destroy();
        RadiYo.deleteVoiceManager(this.GUILD.id);
        
    }
    public getVoiceConnection() : VoiceConnection | undefined {
        return getVoiceConnection(this.GUILD.id);
    }
    public getCurrentStationEmbed(): MessageEmbed {
        return new MessageEmbed()
            .setAuthor('RadiYo!')
            .setTitle(`Now Playing ${this.STATION.text} in #${this.VOICE_CHANNEL.name}`)
            .setDescription(htmlDecode(this.STATION.subtext))
            .setThumbnail(this.STATION.image);
    }
    private async sendMetadataChange(song: NowPlaying | string) {
        //todo: check if metadeta is empty before sending
        if(song !== null) {
            if(typeof song !== 'string') {
                const responseMessage = new MessageEmbed()
                    .setAuthor('RadiYo!')
                    .setTitle('Now Playing')
                    .setThumbnail(song.albumArtUrl)
                    .addFields({name: 'Artist', value: song.artist}, 
                        {name: 'Song', value: song.title});
                this.msg_fifo.push(await this.NOTIFICATION_CHANNEL.send({embeds: [responseMessage]}));  
            }
            else {
                const responseMessage = new MessageEmbed()
                    .setAuthor('RadiYo!')
                    .setTitle('Now Playing')
                    .setDescription(song);
                this.msg_fifo.push(await this.NOTIFICATION_CHANNEL.send({embeds: [responseMessage]}));  
            }  
        }
        if(this.msg_fifo.length == 7) {
            this.msg_fifo.shift()?.delete();
        }
    }
}