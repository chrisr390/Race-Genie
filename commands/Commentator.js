const { Readable } = require('stream');

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

            // Convert raw binary buffer into readable stream for @discordjs/voice
            const arrayBuffer = await response.arrayBuffer();
            const stream = Readable.from(Buffer.from(arrayBuffer));
            resource = createAudioResource(stream);
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
