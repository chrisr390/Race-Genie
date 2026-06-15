const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const http = require('http');

// Simple web server for Render health checks
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Race Genie running!\n');
}).listen(process.env.PORT || 3000);

const { GoogleGenAI } = require('@google/genai');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Initialize the client
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.mentions.has(client.user) && !message.mentions.everyone) {
        const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();

        if (!prompt) {
            message.reply("Race Genie is online. What's the setup issue?");
            return;
        }

        await message.channel.sendTyping();

        try {
            // Updated to the current production model string 'gemini-2.5-flash'
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [prompt],
                config: {
                    systemInstruction: "You are Race Genie, a no-nonsense trackside race engineer. Do not say hello. Do not compliment the choices. Start immediately with direct tuning advice using bullet points. Keep explanations to one sentence per point.",
                    maxOutputTokens: 250
                }
            });

            if (response && response.text) {
                message.reply(response.text.trim());
            } else {
                message.reply("Engine's running, but couldn't parse a response.");
            }
        } catch (error) {
            console.error("Race Genie Error Log:", error.message || error);
            message.reply("Hit a bit of an engine snag trying to process that setup.");
        }
    }
});

client.login(DISCORD_TOKEN);
