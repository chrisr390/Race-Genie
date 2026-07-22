const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const googleTTS = require('google-tts-api');

let audioQueue = [];
let isPlaying = false;
const player = createAudioPlayer();

async function playNextInQueue(connection) {
    if (audioQueue.length === 0) {
        isPlaying = false;
        return;
    }

    isPlaying = true;
    const textToSpeak = audioQueue.shift();

    try {
        const url = googleTTS.getAudioUrl(textToSpeak, {
            lang: 'en-GB',
            slow: false,
            host: 'https://translate.google.com',
            timeout: 10000,
        });

        const resource = createAudioResource(url);
        player.play(resource);
        connection.subscribe(player);
    } catch (err) {
        console.error('TTS Error:', err);
        isPlaying = false;
        playNextInQueue(connection);
    }
}

player.on(AudioPlayerStatus.Idle, () => {
    isPlaying = false;
    const connection = getVoiceConnection();
    if (connection) {
        playNextInQueue(connection);
    }
});

function queueSpeech(text, interaction) {
    const channel = interaction.member.voice.channel;
    if (!channel) {
        return interaction.reply({ content: '❌ You must join a voice channel first!', ephemeral: true });
    }

    let connection = getVoiceConnection(interaction.guild.id);

    if (!connection) {
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
        });
    }

    audioQueue.push(text);

    if (!isPlaying) {
        playNextInQueue(connection);
    }

    return interaction.reply({ content: `🎙️ **Commentator:** "${text}"`, ephemeral: true });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('commentator')
        .setDescription('Race Genie Live Voice Commentator')

        .addSubcommand(sub => sub.setName('join').setDescription('Connect commentator to your voice channel'))
        .addSubcommand(sub => sub.setName('leave').setDescription('Disconnect commentator from voice channel'))

        .addSubcommand(sub =>
            sub.setName('welcome')
                .setDescription('Broadcast race welcome message in voice channel')
                .addStringOption(opt => opt.setName('event_name').setDescription('Track or Event name').setRequired(true))
        )

        .addSubcommand(sub =>
            sub.setName('gaps')
                .setDescription('Broadcast live leader and driver gaps in voice channel')
                .addStringOption(opt => opt.setName('leader').setDescription('P1 Driver Name').setRequired(true))
                .addStringOption(opt => opt.setName('second').setDescription('P2 Driver Name').setRequired(false))
                .addStringOption(opt => opt.setName('gap1_2').setDescription('Gap 1st to 2nd (e.g. 1.4 seconds)').setRequired(false))
                .addStringOption(opt => opt.setName('third').setDescription('P3 Driver Name').setRequired(false))
                .addStringOption(opt => opt.setName('gap2_3').setDescription('Gap 2nd to 3rd (e.g. 0.8 seconds)').setRequired(false))
        )

        .addSubcommand(sub =>
            sub.setName('lap-gap')
                .setDescription('Post lap positions and gaps as a text card in chat')
                .addIntegerOption(opt => opt.setName('lap').setDescription('Current Lap Number').setRequired(true))
                .addStringOption(opt => opt.setName('leader').setDescription('P1 Driver').setRequired(true))
                .addStringOption(opt => opt.setName('second').setDescription('P2 Driver').setRequired(false))
                .addStringOption(opt => opt.setName('gap1_2').setDescription('Gap P1 to P2 (e.g. 1.4s)').setRequired(false))
                .addStringOption(opt => opt.setName('third').setDescription('P3 Driver').setRequired(false))
                .addStringOption(opt => opt.setName('gap2_3').setDescription('Gap P2 to P3 (e.g. 0.8s)').setRequired(false))
        )

        .addSubcommand(sub =>
            sub.setName('finish')
                .setDescription('Broadcast checkered flag and podium finishes in voice')
                .addStringOption(opt => opt.setName('winner').setDescription('Race Winner').setRequired(true))
                .addStringOption(opt => opt.setName('second').setDescription('Second Place').setRequired(true))
                .addStringOption(opt => opt.setName('third').setDescription('Third Place').setRequired(true))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'join') {
            const channel = interaction.member.voice.channel;
            if (!channel) return interaction.reply({ content: '❌ Join a voice channel first!', ephemeral: true });

            joinVoiceChannel({
                channelId: channel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
                selfDeaf: false,
            });

            return interaction.reply({ content: `🎙️ Commentator connected to **${channel.name}**!`, ephemeral: true });
        }

        if (subcommand === 'leave') {
            const connection = getVoiceConnection(interaction.guild.id);
            if (!connection) return interaction.reply({ content: '❌ Commentator is not in a voice channel.', ephemeral: true });

            audioQueue = [];
            isPlaying = false;
            connection.destroy();
            return interaction.reply({ content: '👋 Commentator disconnected.', ephemeral: true });
        }

        if (subcommand === 'welcome') {
            const eventName = interaction.options.getString('event_name');
            const speech = `Welcome ladies and gentlemen to Future Champions Social Club! We are live for today's race at ${eventName}. Red lights are on, and we are ready for racing!`;
            return queueSpeech(speech, interaction);
        }

        if (subcommand === 'gaps') {
            const leader = interaction.options.getString('leader');
            const second = interaction.options.getString('second');
            const gap1_2 = interaction.options.getString('gap1_2');
            const third = interaction.options.getString('third');
            const gap2_3 = interaction.options.getString('gap2_3');

            let speech = `${leader} is currently leading the race.`;
            if (second && gap1_2) speech += ` ${second} is in second, trailing by ${gap1_2}.`;
            else if (second) speech += ` ${second} sits in second.`;

            if (third && gap2_3) speech += ` ${third} is in third, ${gap2_3} further back.`;
            else if (third) speech += ` ${third} holds third position.`;

            return queueSpeech(speech, interaction);
        }

        if (subcommand === 'lap-gap') {
            const lap = interaction.options.getInteger('lap');
            const leader = interaction.options.getString('leader');
            const second = interaction.options.getString('second');
            const gap1_2 = interaction.options.getString('gap1_2');
            const third = interaction.options.getString('third');
            const gap2_3 = interaction.options.getString('gap2_3');

            let gapText = `🥇 **P1:** ${leader}\n`;
            if (second) gapText += `🥈 **P2:** ${second} ${gap1_2 ? `*(+${gap1_2})*` : ''}\n`;
            if (third) gapText += `🥉 **P3:** ${third} ${gap2_3 ? `*(+${gap2_3})*` : ''}\n`;

            const gapEmbed = new EmbedBuilder()
                .setTitle(`🏎️ LAP ${lap} STANDINGS & GAPS`)
                .setDescription(gapText)
                .setColor('#FFCC00')
                .setFooter({ text: 'Future Champions Social Club • Live Feed' })
                .setTimestamp();

            return interaction.reply({ embeds: [gapEmbed] });
        }

        if (subcommand === 'finish') {
            const winner = interaction.options.getString('winner');
            const second = interaction.options.getString('second');
            const third = interaction.options.getString('third');

            const speech = `The checkered flag drops! Taking victory today, congratulations to ${winner}! Finishing in second place is ${second}, and rounding out the podium in third is ${third}. Thank you all for tuning in, keep it clean on track!`;

            return queueSpeech(speech, interaction);
        }
    }
};
