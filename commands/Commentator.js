const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection, StreamType, entersState } = require('@discordjs/voice');
const googleTTS = require('google-tts-api');
const axios = require('axios');

// ==========================================
// 🎙️ CUSTOM ELEVENLABS VOICE CONFIGURATION
// ==========================================
const ELEVENLABS_VOICE_ID = 'lcMyyd2HUfFzxdCaC4Ta'; 

let audioQueue = [];
let isPlaying = false;
const player = createAudioPlayer();

// Catch player errors in Render logs
player.on('error', error => {
    console.error('❌ Audio Player Error:', error.message, error);
    isPlaying = false;
    const connection = getVoiceConnection();
    if (connection) playNextInQueue(connection);
});

player.on(AudioPlayerStatus.Idle, () => {
    isPlaying = false;
    const connection = getVoiceConnection();
    if (connection) {
        playNextInQueue(connection);
    }
});

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function playNextInQueue(connection) {
    if (audioQueue.length === 0) {
        isPlaying = false;
        return;
    }

    isPlaying = true;
    const textToSpeak = audioQueue.shift();
    const apiKey = process.env.ELEVENLABS_API_KEY;

    try {
        let resource;

        if (apiKey) {
            console.log(`🎙️ Generating ElevenLabs TTS for: "${textToSpeak}"`);
            const response = await axios({
                method: 'post',
                url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
                headers: {
                    'Accept': 'audio/mpeg',
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json',
                },
                data: {
                    text: textToSpeak,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    },
                },
                responseType: 'stream',
            });

            resource = createAudioResource(response.data, { inputType: StreamType.Arbitrary });
        } else {
            console.log(`🎙️ Generating Google TTS fallback for: "${textToSpeak}"`);
            const url = googleTTS.getAudioUrl(textToSpeak, {
                lang: 'en-GB',
                slow: false,
                host: 'https://translate.google.com',
                timeout: 10000,
            });
            resource = createAudioResource(url, { inputType: StreamType.Arbitrary });
        }

        player.play(resource);
        connection.subscribe(player);
    } catch (err) {
        console.error('❌ Primary Voice Error, falling back to Google TTS:', err.message);
        
        try {
            const fallbackUrl = googleTTS.getAudioUrl(textToSpeak, { lang: 'en-GB', slow: false });
            const resource = createAudioResource(fallbackUrl, { inputType: StreamType.Arbitrary });
            player.play(resource);
            connection.subscribe(player);
        } catch (fallbackErr) {
            console.error('❌ Fallback TTS Error:', fallbackErr);
            isPlaying = false;
            playNextInQueue(connection);
        }
    }
}

async function queueSpeech(text, interaction) {
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

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                ]);
            } catch (e) {
                connection.destroy();
            }
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
                .addStringOption(opt => opt.setName('laps').setDescription('Number of laps or race duration').setRequired(false))
        )

        .addSubcommand(sub =>
            sub.setName('gaps')
                .setDescription('Broadcast live leader and driver gaps in voice channel')
                .addStringOption(opt => opt.setName('leader').setDescription('P1 Driver Name').setRequired(true))
                .addStringOption(opt => opt.setName('second').setDescription('P2 Driver Name').setRequired(false))
                .addStringOption(opt => opt.setName('gap1_2').setDescription('Gap P1 to P2 (e.g. 1.4 seconds)').setRequired(false))
                .addStringOption(opt => opt.setName('third').setDescription('P3 Driver Name').setRequired(false))
                .addStringOption(opt => opt.setName('gap2_3').setDescription('Gap P2 to P3 (e.g. 0.8 seconds)').setRequired(false))
        )

        .addSubcommand(sub =>
            sub.setName('penalty')
                .setDescription('Broadcast a driver penalty in voice channel')
                .addStringOption(opt => opt.setName('driver').setDescription('Driver Name').setRequired(true))
                .addStringOption(opt => opt.setName('location').setDescription('Turn / Corner (e.g. Turn 7)').setRequired(false))
                .addStringOption(opt => opt.setName('reason').setDescription('Reason (e.g. track limits)').setRequired(false))
        )

        .addSubcommand(sub =>
            sub.setName('finish')
                .setDescription('Broadcast checkered flag and podium in voice')
                .addStringOption(opt => opt.setName('winner').setDescription('Race Winner (P1)').setRequired(true))
                .addStringOption(opt => opt.setName('second').setDescription('Second Place (P2)').setRequired(false))
                .addStringOption(opt => opt.setName('third').setDescription('Third Place (P3)').setRequired(false))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'join') {
            const channel = interaction.member.voice.channel;
            if (!channel) return interaction.reply({ content: '❌ Join a voice channel first!', ephemeral: true });

            const connection = joinVoiceChannel({
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
            const laps = interaction.options.getString('laps');

            const intros = [
                `Welcome ladies and gentlemen to Future Champions Social Club! We are live for tonight's main event at ${eventName}.`,
                `Good evening drivers! It is race night at Future Champions, and we are live at ${eventName}.`,
                `Welcome back racing fans! The atmosphere is electric here at ${eventName} as drivers grid up for Future Champions.`
            ];

            let speech = pickRandom(intros);
            if (laps) speech += ` We are set for ${laps} of wheel-to-wheel action.`;
            speech += ` The five red lights are on, engine revs are high, and we are ready for racing!`;

            return queueSpeech(speech, interaction);
        }

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

            if (second && gap1_2) speech += ` ${second} sits in second place, trailing by ${gap1_2}.`;
            else if (second) speech += ` ${second} is currently holding second position.`;

            if (third && gap2_3) speech += ` ${third} holds third, a further ${gap2_3} down the road.`;
            else if (third) speech += ` ${third} rounds out the top three.`;

            return queueSpeech(speech, interaction);
        }

        if (subcommand === 'penalty') {
            const driver = interaction.options.getString('driver');
            const location = interaction.options.getString('location') || 'turn 7';
            const reason = interaction.options.getString('reason') || 'taking too many liberties';

            const penaltyPhrases = [
                `Oh dear! ${driver} has picked up a penalty on ${location} for ${reason}. What a silly boy!`,
                `Penalty for ${driver}! Caught out on ${location} for ${reason}. That is going to cost them!`,
                `Oh, look at that! ${driver} gets a penalty on ${location} for ${reason}. Absolute schoolboy error!`
            ];

            const speech = pickRandom(penaltyPhrases);
            return queueSpeech(speech, interaction);
        }

        if (subcommand === 'finish') {
            const winner = interaction.options.getString('winner');
            const second = interaction.options.getString('second');
            const third = interaction.options.getString('third');

            const victoryIntros = [
                `The checkered flag drops! What a drive! Taking victory today, congratulations to ${winner}!`,
                `Checkered flag is out! Crossing the line to claim a brilliant win, taking top spot on the podium is ${winner}!`,
                `And that is race over! What a masterclass of driving from ${winner}, who takes victory at Future Champions!`
            ];

            let speech = pickRandom(victoryIntros);

            if (second && third) {
                speech += ` ${second} secures second place, and ${third} rounds out today's podium in third!`;
            } else if (second) {
                speech += ` ${second} brings it home in second place!`;
            }

            speech += ` Outstanding racing from everyone tonight, bring those cars safely home!`;

            return queueSpeech(speech, interaction);
        }
    }
};
