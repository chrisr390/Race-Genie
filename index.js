const { Client, GatewayIntentBits, ActivityType, ChannelType, Partials } = require('discord.js');
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
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Server-side conversation memory map
const conversations = new Map();

// Configuration constants
const MAX_HISTORY = 6; // Tracks up to 3 user prompts and 3 bot responses
const TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes (1 hour) in milliseconds

// Periodic memory cleanup routine running every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [userId, session] of conversations.entries()) {
        if (now - session.lastActive > TIMEOUT_MS) {
            conversations.delete(userId);
            console.log(`Cleaned up idle session memory for user: ${userId}`);
        }
    }
}, 5 * 60 * 1000);

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isDM = message.channel.type === ChannelType.DM;
    const isMentioned = message.mentions.has(client.user) && !message.mentions.everyone;

    if (isDM || isMentioned) {
        const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();

        if (!prompt) {
            message.reply("Race Genie is online. What's the setup issue?");
            return;
        }

        await message.channel.sendTyping();

        const userId = message.author.id;
        const now = Date.now();

        // Retrieve existing session or initialize a clean one
        if (!conversations.has(userId) || (now - conversations.get(userId).lastActive > TIMEOUT_MS)) {
            conversations.set(userId, { history: [], lastActive: now });
        }

        const session = conversations.get(userId);
        session.lastActive = now; // Reset the 1-hour countdown clock on new message

        // Format the history context for the Gemini API structure
        const apiContents = [];
        for (const msg of session.history) {
            apiContents.push({
                role: msg.role,
                parts: [{ text: msg.text }]
            });
        }
        
        // Append the incoming driver prompt
        apiContents.push({
            role: 'user',
            parts: [{ text: prompt }]
        });

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: apiContents,
                config: {
                    systemInstruction: "You are Race Genie, a no-nonsense trackside race engineer. Do not say hello, do not introduce the topic, and do not compliment choices. Start immediately with direct, actionable tuning advice using bullet points. You must provide specific numerical ranges, slider directions, or concrete mechanical adjustments for the exact car, tires, and track conditions requested. Keep explanations to one clear sentence per point.",
                    maxOutputTokens: 1850
                }
            });

            const engineerResponse = response.text;

            // Commit the exchange to memory
            session.history.push({ role: 'user', text: prompt });
            session.history.push({ role: 'model', text: engineerResponse });

            if (session.history.length > MAX_HISTORY) {
                session.history.splice(0, session.history.length - MAX_HISTORY);
            }

            // Route response
            if (!isDM) {
                try {
                    await message.author.send(engineerResponse);
                    await message.reply("🏁 *Check your DMs, driver! I've sent the setup sheets over.*");
                } catch (dmError) {
                    console.error("Could not send DM to user:", dmError);
                    await message.reply("⚠️ *I tried to DM you the setup, but your privacy settings blocked me! Here it is instead:*\n\n" + engineerResponse);
                }
            } else {
                await message.reply(engineerResponse);
            }

        } catch (error) {
            console.error("AI Error:", error);
            await message.reply("Engineering error. The telemetry link dropped.");
        }
    }
});

client.login(DISCORD_TOKEN);
