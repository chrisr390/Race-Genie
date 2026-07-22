const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const googleTTS = require('google-tts-api');

let audioQueue = [];
let isPlaying = false;
const player = createAudioPlayer();

// Helper to pick random commentary variations
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

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

        // --- CONNECT / DISCONNECT ---
        .addSubcommand(sub => sub.setName('join').setDescription('Connect commentator to your voice channel'))
        .addSubcommand(sub => sub.setName('leave').setDescription('Disconnect commentator from voice channel'))

        // --- 1. WELCOME BROADCAST ---
        .addSubcommand(sub =>
            sub.setName('welcome')
                .setDescription('Broadcast race welcome message in voice channel')
                .addStringOption(opt => opt.setName('event_name').setDescription('Track or Event name (e.g. Spa, Trial Mountain)').setRequired(true))
                .addStringOption(opt => opt.setName('laps').setDescription('Number of laps or race duration (e.g. 15 Laps)').setRequired(false))
        )

        // --- 2. GAPS CALLOUT ---
        .addSubcommand(sub =>
            sub.setName('gaps')
                .setDescription('Broadcast live leader and driver gaps in voice channel')
                .addStringOption(opt => opt.setName('leader').setDescription('P1 Driver Name').setRequired(true))
                .addStringOption(opt => opt.setName('second').setDescription('P2 Driver Name').setRequired(false))
                .addStringOption(opt => opt.setName('gap1_2').setDescription('Gap P1 to P2 (e.g. 1.4 seconds)').setRequired(false))
                .addStringOption(opt => opt.setName('third').setDescription('P3 Driver Name').setRequired(false))
                .addStringOption(opt => opt.setName('gap2_3').setDescription('Gap P2 to P3 (e.g. 0.8 seconds)').setRequired(false))
        )

        // --- 3. FINISH & PODIUM ---
        .addSubcommand(sub =>
            sub.setName('finish')
                .setDescription('Broadcast checkered flag, winner, and podium in voice')
                .addStringOption(opt => opt.setName('winner').setDescription('Race Winner (P1)').setRequired(true))
                .addStringOption(opt => opt.setName('second').setDescription('Second Place (P2)').setRequired(false))
                .addStringOption(opt => opt.setName('third').setDescription('Third Place (P3)').setRequired(false))
        )

        // --- LAP GAP TEXT CARD ---
        .addSubcommand(sub =>
            sub.setName('lap-gap')
                .setDescription('Post lap positions and gaps as a text card in chat')
                .addIntegerOption(opt => opt.setName('lap').setDescription('Current Lap Number').setRequired(true))
                .addStringOption(opt => opt.setName('leader').setDescription('P1 Driver').setRequired(true))
                .addStringOption(opt => opt.setName('second').setDescription('P2 Driver').setRequired(false))
                .addStringOption(opt => opt.setName('gap1_2').setDescription('Gap P1 to P2 (e.g. 1.4s)').setRequired(false))
                .addStringOption(opt => opt.setName('third').setDescription('P3 Driver').setRequired(false))
                .addStringOption(opt => opt.setName('gap2_3').setDescription('Gap P2 to P3 (e.g. 0.8s)').setRequired(false))
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

        // ==========================================
        // 🎙️ 1. WELCOME SCRIPT
        // ==========================================
        if (subcommand === 'welcome') {
            const eventName = interaction.options.getString('event_name');
            const laps = interaction.options.getString('laps');

            const intros = [
                `Welcome ladies and gentlemen to Future Champions Social Club! We are live for tonight's main event at ${eventName}.`,
                `Good evening and welcome drivers! It is race night at Future Champions, and we are live at ${eventName}.`,
                `Welcome back racing fans! The atmosphere is electric here at ${eventName} as drivers grid up for Future Champions Social Club.`
            ];

            let speech = pickRandom(intros);
            if (laps) {
                speech += ` We are set for ${laps} of wheel-to-wheel action.`;
            }
            speech += ` The five red lights are on, engine revs are high, and we are ready for racing!`;

            return queueSpeech(speech, interaction);
        }

        // ==========================================
        // 🎙️ 2. GAPS SCRIPT
        // ==========================================
        if (subcommand === 'gaps') {
            const leader = interaction.options.getString('leader');
            const second = interaction.options.getString('second');
            const gap1_2 = interaction.options.getString('gap1_2');
            const third = interaction.options.getString('third');
            const gap2_3 = interaction.options.getString('gap2_3');

            const leaderIntros = [
                `${leader} continues to command the pace out in front.`,
                `${leader} is setting the rhythm at the head of the field.`,
                `${leader} holds the lead as they cross the line.`
            ];

            let speech = pickRandom(leaderIntros);

            if (second && gap1_2) {
                const p2Phrases = [
                    ` ${second} sits in second place, trailing by ${gap1_2}.`,
                    ` ${second} is giving chase in second, ${gap1_2} off the lead.`,
                    ` Behind in second is ${second}, keeping the pressure on at ${gap1_2} back.`
                ];
                speech += pickRandom(p2Phrases);
            } else if (second) {
                speech += ` ${second} is currently holding second position.`;
            }

            if (third && gap2_3) {
                const p3Phrases = [
                    ` ${third} holds third, a further ${gap2_3} down the road.`,
                    ` And ${third} completes the top three, trailing by ${gap2_3}.`,
                    ` ${third} sits in third, ${gap2_3} adrift.`
                ];
                speech += pickRandom(p3Phrases);
            } else if (third) {
                speech += ` ${third} rounds out the top three.`;
            }

            return queueSpeech(speech, interaction);
        }

        // ==========================================
        // 🎙️ 3. FINISH & PODIUM SCRIPT
        // ==========================================
        if (subcommand === 'finish') {
            const winner = interaction.options.getString('winner');
            const second = interaction.options.getString('second');
            const third = interaction.options.getString('third');

            const victoryIntros = [
                `The checkered flag drops! What a drive! Taking a sensational victory today, congratulations to ${winner}!`,
                `Checkered flag is out! Crossing the line to claim a brilliant win, taking top spot on the podium is ${winner}!`,
                `And that is race over! What a masterclass of driving from ${winner}, who takes victory at Future Champions Social Club!`
            ];

            let speech = pickRandom(victoryIntros);

            if (second && third) {
                speech += ` ${second} puts in a stellar performance to secure second place, and ${third} rounds out today's podium in third!`;
            } else if (second) {
                speech += ` ${second} brings it home in second place!`;
            }

            speech += ` Outstanding racing from everyone tonight, bring those cars safely home on the cool-down lap!`;

            return queueSpeech(speech, interaction);
        }

        // ==========================================
        // 📄 4. CHAT LAP GAP CARD
        // ==========================================
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
    }
};
