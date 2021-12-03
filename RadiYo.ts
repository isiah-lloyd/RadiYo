import { Client, ClientUser, Guild, MessageActionRow, MessageEmbed, MessageSelectMenu, MessageSelectOptionData, TextBasedChannels, VoiceChannel } from 'discord.js';
import 'dotenv/config';
import featuredStationsJSON from './featured_stations.json';
import { RadioPlayer } from './RadioPlayer';
import { FeaturedStation, Station, StationNowPlaying } from './util/interfaces';
import logger from './util/logger';
import { VoiceManager } from './VoiceManager';

class RadiYo {
    readonly DISCORD_TOKEN : string = this.getEnv('DISCORD_TOKEN');
    readonly DISCORD_OAUTH_CLIENT_ID : string = this.getEnv('DISCORD_OAUTH_CLIENT_ID');
    readonly DISCORD_GUILD_ID : string = this.getEnv('DISCORD_GUILD_ID');
    readonly NOTIFICATION_CHANNEL_ID : string = this.getEnv('NOTIFICATION_CHANNEL_ID');
    readonly RADIO_DIRECTORY_KEY: string = this.getEnv('RADIO_DIRECTORY_KEY');

    public VOICE_MANAGERS: Map<string, VoiceManager> = new Map();
    public RADIO_PLAYERS: Map<string, RadioPlayer> = new Map();
    public CLIENT: Client | null = null;
    private featuredStations: FeaturedStation[] = [];

    private getEnv(envVar: string): string {
        const p = process.env[envVar];
        if(p !== undefined){
            return p;
        }
        else {
            throw new ReferenceError(`Environment Variable {${envVar}} is not defined.`);
        }
    }
    public getVoiceManager(guild: Guild): VoiceManager | null {
        const player = this.VOICE_MANAGERS.get(guild.id);
        if(player) return player; else return null;
    }
    public createVoiceManager(guild: Guild, notificationChannel: TextBasedChannels, voiceChannel: VoiceChannel) : VoiceManager {
        const rs = this.getVoiceManager(guild);
        if(rs) {
            if(voiceChannel.id !== rs.VOICE_CHANNEL.id || notificationChannel.id !== rs.NOTIFICATION_CHANNEL.id) {
                rs.leaveVoiceChannel();
                const newVm = new VoiceManager(guild, notificationChannel, voiceChannel);
                this.VOICE_MANAGERS.set(guild.id, newVm);
                return newVm;
            }
            return rs;
        }
        else {
            const newVm = new VoiceManager(guild, notificationChannel, voiceChannel);
            this.VOICE_MANAGERS.set(guild.id, newVm);
            logger.info(`CREATE: There are currently ${this.VOICE_MANAGERS.size} voice managers in memory`);
            return newVm;
        }
    }
    public deleteVoiceManager(guildId: string): boolean {
        const v = this.VOICE_MANAGERS.delete(guildId);
        logger.info(`DELETE: There are currently ${this.VOICE_MANAGERS.size} voice managers in memory`);
        return v;
    }
    public getRadioPlayer(station: Station): RadioPlayer {
        let rp = this.RADIO_PLAYERS.get(station.streamDownloadURL);
        if(!rp) {
            rp = new RadioPlayer();
            rp.play(station);
            this.RADIO_PLAYERS.set(station.streamDownloadURL, rp);
        }
        logger.info(`GET: There are currently ${this.RADIO_PLAYERS.size} radio players in memory`);
        return rp;
    }
    public deleteRadioPlayer(station: Station): boolean {
        const v = this.RADIO_PLAYERS.delete(station.streamDownloadURL);
        logger.info(`DELETE (${v}): There are currently ${this.RADIO_PLAYERS.size} radio players in memory`);
        return v;
    }
    public getBotUser(): ClientUser {
        const user = this.CLIENT?.user;
        if(user) return user;
        else throw new Error('Could not fetch bot user');
    }
    public newMsgEmbed() : MessageEmbed {
        return new MessageEmbed()
            .setAuthor('RadiYo!',
                'https://cdn.discordapp.com/avatars/895354013116153876/90d756ddeab4c129d89b9f60df44ba95.png?size=32',
                'https://github.com/isiah-lloyd/RadiYo');
    }
    public stationListEmbed(stations: Station[]) : {embed: MessageEmbed, component: MessageActionRow} {
        const msg = this.newMsgEmbed();
        const fields = [];
        const selectOptions: MessageSelectOptionData[] = [];
        if(stations) {
            for(let i = 0; i <= 5; i++) {
                if(stations[i]) {
                    const nameObj = {
                        name: 'Name',
                        value: stations[i].text,
                        inline: true
                    };
                    const descObj = {
                        name: 'Description',
                        value: stations[i].subtext ? stations[i].subtext : 'N/A',
                        inline: true
                    };
                    const genreObj = {
                        name: 'Genre',
                        value: stations[i].genre ? stations[i].genre : 'N/A',
                        inline: true
                    };
                    fields.push(nameObj, descObj, genreObj);
                    selectOptions.push({label: stations[i].text, value: stations[i].id});
                }
            }
        }
        const row = new MessageActionRow().addComponents(
            new MessageSelectMenu().setCustomId('choose_station')
                .setPlaceholder('Select station to play...')
                .addOptions(selectOptions)
        );
        return {embed:msg.addFields(fields), component: row};
    }
    public nowPlayingListEmbed(stations: StationNowPlaying[]) : {embed: MessageEmbed, component: MessageActionRow} {
        const msg = this.newMsgEmbed();
        const fields = [];
        const selectOptions: MessageSelectOptionData[] = [];
        if(stations) {
            for(let i = 0; i <= 5; i++) {
                if(stations[i]) {
                    const nameObj = {
                        name: 'Name',
                        value: stations[i].text,
                        inline: true
                    };
                    const npObj = {
                        name: 'Now Playing',
                        value: `${stations[i].nowPlaying.artist} - ${stations[i].nowPlaying.title}`,
                        inline: true
                    };
                    const nopObj = {
                        name: '\u200b',
                        value: '\u200b',
                        inline: true
                    };

                    fields.push(nameObj, npObj, nopObj);
                    selectOptions.push({label: `${stations[i].nowPlaying.artist} - ${stations[i].nowPlaying.title}`, value: stations[i].id});
                }
            }
        }
        const row = new MessageActionRow().addComponents(
            new MessageSelectMenu().setCustomId('choose_station')
                .setPlaceholder('Select song to play...')
                .addOptions(selectOptions)
        );
        return {embed:msg.addFields(fields), component: row};
    }
    public downloadFeaturedStations(): void {
        logger.debug('Downloading Featured Stations');
        try {
            featuredStationsJSON.forEach((category) => {
                const temp: FeaturedStation = {} as FeaturedStation;
                temp.title = category.title;
                temp.description = category.description;
                temp.stations = [];
                category.station_ids.forEach(async (stationId) => {
                    let result: Station;
                    try {
                        result = await RadioPlayer.searchByStationId(stationId);
                        temp.stations.push(result);
                    }
                    catch(err) {
                        throw new Error(`There was an issue downloading a featured station ${err}`);
                    }
                });
                this.featuredStations.push(temp);
            });
        }
        catch(err) {
            logger.error('There was an error downloading featured stations', err);
            this.featuredStations = [];
        }
    }
    public getFeaturedStations(): FeaturedStation[] {
        if(this.featuredStations.length !== 0) {
            return this.featuredStations;
        }
        else {
            //TODO: This currently doesn't really work
            logger.debug('No features stations...downloading');
            this.downloadFeaturedStations();
            return this.featuredStations;
        }
    }
}

export default new RadiYo();