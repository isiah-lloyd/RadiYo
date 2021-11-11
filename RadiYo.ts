import {Client, ClientUser, Guild, MessageEmbed, TextBasedChannels, VoiceChannel } from 'discord.js';
import 'dotenv/config';
import { RadioPlayer } from './RadioPlayer';
import { Station } from './util/interfaces';
import { VoiceManager } from './VoiceManager';

class RadiYo {
    readonly DISCORD_TOKEN : string = this.getEnv('DISCORD_TOKEN');
    readonly DISCORD_OAUTH_CLIENT_ID : string = this.getEnv('DISCORD_OAUTH_CLIENT_ID');
    readonly DISCORD_GUILD_ID : string = this.getEnv('DISCORD_GUILD_ID');
    readonly RADIO_DIRECTORY_KEY: string = this.getEnv('RADIO_DIRECTORY_KEY'); 

    public VOICE_MANAGERS: Map<string, VoiceManager> = new Map();
    public RADIO_PLAYERS: Map<string, RadioPlayer> = new Map();
    public CLIENT: Client | null = null;

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
                console.debug('Switching channels');
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
            console.debug(`There are currently ${this.VOICE_MANAGERS.size} voice managers in memory`);   
            return newVm;
        }
    }
    public deleteVoiceManager(guildId: string): boolean {
        const v = this.VOICE_MANAGERS.delete(guildId);
        console.debug(`There are currently ${this.VOICE_MANAGERS.size} voice managers in memory`);   
        return v;
    }
    public getRadioPlayer(station: Station): RadioPlayer {
        let rp = this.RADIO_PLAYERS.get(station.streamDownloadURL);
        if(!rp) {
            rp = new RadioPlayer();
            rp.play(station);
            this.RADIO_PLAYERS.set(station.streamDownloadURL, rp);
        }
        console.debug(`There are currently ${this.RADIO_PLAYERS.size} radio players in memory`);   
        return rp;
    }
    public getBotUser(): ClientUser {
        const user = this.CLIENT?.user;
        if(user) return user;
        else throw new Error('Could not fetch bot user');
    }
    public deleteRadioPlayer(station: Station): boolean {
        //TODO: Actually implement this
        const v = this.RADIO_PLAYERS.delete(station.streamDownloadURL);
        console.debug(`There are currently ${this.RADIO_PLAYERS.size} radio players in memory`);   
        return v;
    }
    public newMsgEmbed() : MessageEmbed {
        return new MessageEmbed()
            .setAuthor('RadiYo!', 
                'https://cdn.discordapp.com/avatars/895354013116153876/90d756ddeab4c129d89b9f60df44ba95.png?size=32',
                'https://github.com/isiah-lloyd/RadiYo');
    }
}

export default new RadiYo();