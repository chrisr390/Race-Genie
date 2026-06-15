const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
// A simple web server to satisfy Render's web service health checks
const http = require('http');
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Race Genie is firing on all cylinders!\n');
}).listen(process.env.PORT || 3000);
const { GoogleGenAI } = require('@google/genai');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    // Adds a 60-second window for the handshake to clear network bottlenecks
    rest: {
        timeout: 60000,
        retries: 3
    }
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('with Gemini 2.0', { type: ActivityType.Playing });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.mentions.has(client.user) && !message.mentions.everyone) {
        const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();

        if (!prompt) {
            message.reply("Race Genie is active! Drop a question and I'll jump on it.");
            return;
        }

        await message.channel.sendTyping();

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-1.5-flash',
                contents: prompt,
            });

            if (response.text) {
                if (response.text.length > 2000) {
                    message.reply(response.text.substring(0, 1999));
                } else {
                    message.reply(response.text);
                }
            } else {
                message.reply("I processed that, but couldn't map a text response out of it.");
            }
        } catch (error) {
            console.error("Gemini Error:", error);
            message.reply("Sorry mate, hit a bit of an engine snag trying to process that prompt.");
        }
    }
});

client.login(DISCORD_TOKEN);
