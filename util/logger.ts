import winston, { LogEntry } from 'winston';
import Transport from 'winston-transport';
import RadiYo from '../RadiYo';
import {Interaction, TextChannel } from 'discord.js';

const timezoneTime = () => {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York'
    });
};
interface logFmt extends LogEntry {
    interaction?: Interaction;
}

class DiscordTransport extends Transport {
    constructor(opts?: winston.transport.TransportStreamOptions) {
        super(opts);
    }
    log(info: logFmt , next: () => void) {
        const embed = RadiYo.newMsgEmbed().setTitle(info.level).setDescription(info.message);
        if(info.level === 'error') {
            embed.setColor('RED');
        }
        else if(info.level === 'info') {
            embed.setColor('BLUE');
        }
        (RadiYo.CLIENT?.channels.cache.get(RadiYo.NOTIFICATION_CHANNEL_ID) as TextChannel)?.send({embeds: [embed]});
        next();
    }
}


const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            level: 'silly',
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({format: timezoneTime}),
                winston.format.printf(
                    (info) => `${info.timestamp} -- [ ${info.level} ] -- ${info.message}`
                )
            )
        }
        ),
        new DiscordTransport({level: 'info', format: winston.format.json()})
    ],
    handleExceptions: true,
    exitOnError: false
});

export default logger;