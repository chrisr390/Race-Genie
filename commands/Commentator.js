const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection, StreamType } = require('@discordjs/voice');
const googleTTS = require('google-tts-api');
const { Readable } = require('stream');

// ==========================================
// 🎙️ CUSTOM ELEVENLABS VOICE CONFIGURATION
// ==========================================
const ELEVENLABS_VOICE_ID = 'lcMyyd2HUfFzxdCaC4Ta'; 

let audioQueue = [];
let isPlaying = false;
const player = createAudioPlayer();

player.on('error', error => {
    console.error('❌ Audio Player Error:', error.message);
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

            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'xi-api-key': apiKey.trim(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: textToSpeak,
                    model_id: 'eleven_turbo_v2_5',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    },
                }),
            });

            if (!response.ok) {
                const errorJson = await response.json().catch(() => ({ detail: 'Unknown error' }));
                throw new Error(`ElevenLabs API HTTP ${response.status}: ${JSON.stringify(errorJson)}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const stream = Readable.from(buffer);

            // StreamType.Arbitrary forces FFmpeg/Prism to decode MP3 into raw Discord PCM
            resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
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

        connection.subscribe(player);
        player.play(resource);
        console.log('▶️ Audio resource playing successfully!');

    } catch (err) {
        console.error('❌ Primary Voice Error:', err.message);
        console.log('⚠️ Falling back to Google TTS...');
        
        try {
            const fallbackUrl = googleTTS.getAudioUrl(textToSpeak, { lang: 'en-GB', slow: false });
            const resource = createAudioResource(fallbackUrl, { inputType: StreamType.Arbitrary });
            connection.subscribe(player);
            player.play(resource);
        } catch (fallbackErr) {
            console.error('❌ Fallback TTS Error:', fallbackErr);
            isPlaying = false;
            playNextInQueue(connection);
        }
    }
}

async function queueSpeech(text, interaction) {
    const channel = interaction.member.voice?.channel;
    if (!channel) {
        return interaction.editReply({ content: '❌ You must join a voice channel first!' });
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

    return interaction.editReply({ content: `🎙️ **Commentator:** "${text}"` });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('commentator')
        .setDescription('Future Champions Live Voice Announcer v3')

        // --- CONNECT / DISCONNECT ---
        .addSubcommand(sub => sub.setName('join').setDescription('Connect commentator to your voice channel'))
        .addSubcommand(sub => sub.setName('leave').setDescription('Disconnect commentator from voice channel'))

        // --- 1. WELCOME ---
        .addSubcommand(sub =>
            sub.setName('welcome')
                .setDescription('Broadcast session welcome message in voice channel')
                .addStringOption(opt => 
                    opt.setName('session')
                        .setDescription('Select session type')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Race', value: 'race' },
                            { name: 'Qualifying', value: 'quali' }
                        )
                )
                .addStringOption(opt => opt.setName('laps').setDescription('Duration or Laps').setRequired(false))
        )

        // --- 2. GAPS CALLOUT ---
        .addSubcommand(sub =>
            sub.setName('gaps')
                .setDescription('Broadcast live leader and driver gaps in voice channel')
                .addStringOption(opt => opt.setName('leader').setDescription('P1 Driver Name').setRequired(true))
                .addStringOption(opt => opt.setName('second').setDescription('P2 Driver Name').setRequired(false))
                .addStringOption(opt => opt.setName('gap1_2').setDescription('Gap P1 to P2').setRequired(false))
                .addStringOption(opt => opt.setName('third').setDescription('P3 Driver Name').setRequired(false))
                .addStringOption(opt => opt.setName('gap2_3').setDescription('Gap P2 to P3').setRequired(false))
        )

        // --- 3. PENALTY ANNOUNCEMENT ---
        .addSubcommand(sub =>
            sub.setName('penalty')
                .setDescription('Broadcast a driver penalty in voice channel')
                .addStringOption(opt => opt.setName('driver').setDescription('Driver Name').setRequired(true))
                .addStringOption(opt => opt.setName('location').setDescription('Turn / Corner').setRequired(false))
                .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
        )

        // --- 4. FINISH & PODIUM ---
        .addSubcommand(sub =>
            sub.setName('finish')
                .setDescription('Broadcast checkered flag and podium in voice')
                .addStringOption(opt => opt.setName('winner').setDescription('Race Winner (P1)').setRequired(true))
                .addStringOption(opt => opt.setName('second').setDescription('Second Place (P2)').setRequired(false))
                .addStringOption(opt => opt.setName('third').setDescription('Third Place (P3)').setRequired(false))
        )

        // --- 5. CHAT LAP GAP CARD ---
        .addSubcommand(sub =>
            sub.setName('lap-gap')
                .setDescription('Post lap positions and gaps as a text card in chat')
                .addIntegerOption(opt => opt.setName('lap').setDescription('Current Lap Number').setRequired(true))
                .addStringOption(opt => opt.setName('leader').setDescription('P1 Driver').setRequired(true))
                .addStringOption(opt => opt.setName('second').setDescription('P2 Driver').setRequired(false))
                .addStringOption(opt => opt.setName('gap1_2').setDescription('Gap P1 to P2').setRequired(false))
                .addStringOption(opt => opt.setName('third').setDescription('P3 Driver').setRequired(false))
                .addStringOption(opt => opt.setName('gap2_3').setDescription('Gap P2 to P3').setRequired(false))
        ),

    async execute(interaction) {
        // Defer reply immediately so Discord interaction never times out
        await interaction.deferReply({ ephemeral: true });

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'join') {
            const channel = interaction.member.voice?.channel;
            if (!channel) return interaction.editReply({ content: '❌ Join a voice channel first!' });

            joinVoiceChannel({
                channelId: channel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
                selfDeaf: false,
            });

            return interaction.editReply({ content: `🎙️ Commentator connected to **${channel.name}**!` });
        }

        if (subcommand === 'leave') {
            const connection = getVoiceConnection(interaction.guild.id);
            if (!connection) return interaction.editReply({ content: '❌ Commentator is not in a voice channel.' });

            audioQueue = [];
            isPlaying = false;
            connection.destroy();
            return interaction.editReply({ content: '👋 Commentator disconnected.' });
        }

        if (subcommand === 'welcome') {
            const session = interaction.options.getString('session') || 'race';
            const laps = interaction.options.getString('laps');

            if (session === 'quali') {
                const qualiIntros = [
                    `Welcome drivers to qualifying for Future Champions! Pit lane is open, find clear track and lock in those flying laps!`,
                    `Qualifying is officially underway at Future Champions. Drivers have ${laps || 'limited time'} to set their grid positions for tonight's race!`
                ];
                return queueSpeech(pickRandom(qualiIntros), interaction);
            }

            const raceIntros = [
                `Welcome ladies and gentlemen to Future Champions Social Club! We are live for tonight's main race.`,
                `Good evening drivers! Qualifying is complete and the grid is locked and loaded for the main event.`,
                `Welcome back racing fans! The atmosphere is electric as drivers line up on the grid for Future Champions.`
            ];

            let speech = pickRandom(raceIntros);
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

            return queueSpeech(pickRandom(penaltyPhrases), interaction);
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

            return interaction.editReply({ embeds: [gapEmbed] });
        }
    }
};
