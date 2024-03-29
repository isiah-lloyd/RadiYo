import { DiscordGatewayAdapterCreator, getVoiceConnection, joinVoiceChannel, PlayerSubscription, VoiceConnection } from '@discordjs/voice';
import { EmbedFieldData, Guild, InteractionReplyOptions, Message, MessageActionRow, MessageButton, MessageEmbed, TextBasedChannel, TextChannel, User, VoiceChannel } from 'discord.js';
import { decode as htmlDecode } from 'html-entities';
import { RadioPlayer } from './RadioPlayer';
import RadiYo from './RadiYo';
import { NowPlaying, Station } from './util/interfaces';
import logger from './util/logger';

export class VoiceManager {
    GUILD: Guild;
    NOTIFICATION_CHANNEL: TextBasedChannel;
    VOICE_CHANNEL: VoiceChannel;
    STATION: Station = {} as Station;
    private PLAYER_SUBSCRIPTION: PlayerSubscription | null = null;
    private msg_fifo: Message[] = [];
    private RADIO_PLAYER: RadioPlayer | null = null;
    private boundMetadataFn = this.sendMetadataChange.bind(this);
    private last_msg: MessageEmbed | null = null;
    private timeStarted = Date.now();
    public maxMembers = 0;
    constructor(guild: Guild, notificationChannel: TextBasedChannel, voiceChannel: VoiceChannel, _station: Station) {
        this.GUILD = guild;
        this.NOTIFICATION_CHANNEL = notificationChannel;
        this.VOICE_CHANNEL = voiceChannel;
        this.joinVoiceChannel();
    }
    private joinVoiceChannel() {
        if (!this.VOICE_CHANNEL) {
            logger.debug('No voice channel to join');
        }
        else {
            joinVoiceChannel({
                channelId: this.VOICE_CHANNEL.id,
                guildId: this.GUILD.id,
                adapterCreator: this.GUILD.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator
            });
        }
    }
    public async attachPlayer(station: Station): Promise<boolean> {
        logger.info(`Started playing ${station.text} (${station.id}) in ${this.GUILD.name} (v:#${this.VOICE_CHANNEL.name}, n: #${(this.NOTIFICATION_CHANNEL as TextChannel).name}), ${this.getMembersInChannel()} people in channel`);
        this.maxMembers = this.VOICE_CHANNEL.members.size - 1;
        if (this.PLAYER_SUBSCRIPTION) this.playerUnsubscribe();
        try {
            this.RADIO_PLAYER = await RadiYo.getRadioPlayer(station);
        }
        catch (err) {
            logger.error('There was an error getting radio player: ', err);
            if (this.canSendMsg()) this.NOTIFICATION_CHANNEL.send('There was an error while trying to stream this station, please try another one.');
            this.leaveVoiceChannel();
            return false;
        }
        const playerHolder = this.getVoiceConnection()?.subscribe(this.RADIO_PLAYER.PLAYER);
        if (playerHolder) {
            this.PLAYER_SUBSCRIPTION = playerHolder;
            this.STATION = station;
            console.log(this.RADIO_PLAYER.CURRENT_STATION);
            this.RADIO_PLAYER.on('metadataChange', this.boundMetadataFn);
            this.RADIO_PLAYER.on('error', this.audioPlayerError.bind(this));
            //this.RADIO_PLAYER.on('stationUpdate', (station) => console.log(station));
            return true;
        }
        else {
            logger.debug('Could not attach player to voice connection');
            return false;
        }

    }
    public getElapsedTime(): string {
        return ((Date.now() - this.timeStarted) / 60000).toFixed(2);
    }
    public leaveVoiceChannel(): void {
        logger.info(`Stopped stream in ${this.GUILD.name}, time elapsed ${((Date.now() - this.timeStarted) / 60000).toFixed(2)} mins. Max num of members: ${this.maxMembers}`);
        this.playerUnsubscribe();
        this.getVoiceConnection()?.destroy();
        const lastMsg = this.msg_fifo[this.msg_fifo.length - 1];
        if (lastMsg) {
            // const responseMessage = new MessageEmbed(lastMsg.embeds[0])
            //     .setTitle('Previously Played');
            lastMsg.edit({ components: [] });
        }
        RadiYo.deleteVoiceManager(this.GUILD.id);
    }
    public getVoiceConnection(): VoiceConnection | undefined {
        return getVoiceConnection(this.GUILD.id);
    }
    public async getCurrentStationEmbed(): Promise<InteractionReplyOptions> {
        const embed = RadiYo.newMsgEmbed()
            .setTitle(`Now Playing ${this.STATION.text} in #${this.VOICE_CHANNEL.name}`)
            .setDescription(htmlDecode(this.STATION.subtext))
            .setFooter('Search powered by onrad.io');
        if (this.STATION.image) {
            embed.setThumbnail(this.STATION.image)
        }
        if (this.STATION.genre) {
            embed.setFields({ name: 'Genre', value: this.STATION.genre })
        }
        return { embeds: [embed], components: [] };
    }
    public sendLeavingMsg(): void {
        if (this.canSendMsg()) this.NOTIFICATION_CHANNEL.send(`I'm all alone! Leaving #${this.VOICE_CHANNEL.name}`);
    }
    public getMembersInChannel(): number {
        const memsNow = this.VOICE_CHANNEL.members.filter((member) => member.id !== RadiYo.getBotUser().id).size;
        if (memsNow > this.maxMembers) this.maxMembers = memsNow;
        return memsNow;
    }
    public isUserInVC(user: User): boolean {
        return this.VOICE_CHANNEL.members.has(user.id);
    }
    private playerUnsubscribe(): void {
        this.RADIO_PLAYER?.removeListener('metadataChange', this.boundMetadataFn);
        this.RADIO_PLAYER?.removeListener('error', this.audioPlayerError);
        if (this.PLAYER_SUBSCRIPTION instanceof PlayerSubscription) {
            logger.debug('A Player subscription was found, unsubscribing.');
            this.PLAYER_SUBSCRIPTION.unsubscribe();
            this.PLAYER_SUBSCRIPTION = null;
        }
    }
    private audioPlayerError(error: string): void {
        this.NOTIFICATION_CHANNEL.send(error);
        this.leaveVoiceChannel();
    }
    private canSendMsg(): boolean {
        if (this.GUILD.me && (this.NOTIFICATION_CHANNEL as TextChannel).permissionsFor(this.GUILD.me).has('SEND_MESSAGES')) return true;
        else return false;
    }

    private async sendMetadataChange(song: NowPlaying | string): Promise<void> {
        //todo: check if metadata is empty before sending
        if (song !== null && this.canSendMsg()) {
            let responseMessage: MessageEmbed | null = null;
            if (typeof song !== 'string') {
                const fields: EmbedFieldData[] = [];
                if (this.last_msg?.fields[1] && this.last_msg?.fields[1].value == song.title) return;
                if (song.artist === '' && song.title === '') return;
                if (song.artist !== '') fields.push({ name: 'Artist', value: song.artist });
                if (song.title !== '') fields.push({ name: 'Song', value: song.title });
                responseMessage = RadiYo.newMsgEmbed()
                    .setTitle('Now Playing')
                    .setThumbnail(song.albumArtUrl)
                    .addFields(fields);
            }
            else {
                if (this.last_msg?.description == song) return;
                if (song !== '') {
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
            if (responseMessage) {
                this.last_msg = responseMessage;
                this.msg_fifo.push(await this.NOTIFICATION_CHANNEL.send({ embeds: [responseMessage], components: [row] }));
            }
        }
        if (this.msg_fifo.length > 1) {
            const previousMsg = this.msg_fifo[this.msg_fifo.length - 2];
            /*const responseMessage = new MessageEmbed(previousMsg.embeds[0])
                .setTitle('Previously Played'); */
            previousMsg.edit({ components: [] });
        }
        if (this.msg_fifo.length == 7) {
            this.msg_fifo.shift()?.delete();
        }
    }
}