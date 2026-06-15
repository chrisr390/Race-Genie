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
const MAX_HISTORY = 6; 
const TIMEOUT_MS = 60 * 60 * 1000; // 1-hour conversation memory

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
            message.reply("Race Genie is online. What's the car or track setup issue?");
            return;
        }

        await message.channel.sendTyping();

        const userId = message.author.id;
        const now = Date.now();

        // Manage 1-hour session tracking
        if (!conversations.has(userId) || (now - conversations.get(userId).lastActive > TIMEOUT_MS)) {
            conversations.set(userId, { history: [], lastActive: now });
        }

        const session = conversations.get(userId);
        session.lastActive = now; // Reset the 1-hour countdown clock

        // Build the conversation history payload
        const apiContents = [];
        for (const msg of session.history) {
            apiContents.push({
                role: msg.role,
                parts: [{ text: msg.text }]
            });
        }
        
        // Add the current user prompt
        apiContents.push({
            role: 'user',
            parts: [{ text: prompt }]
        });

        // Built-in instruction framework with perfectly accurate GT7 telemetry bounds
        const systemInstruction = `You are Race Genie, a no-nonsense trackside race engineer dedicated strictly to Gran Turismo 7 (GT7). Pay close attention to the track mentioned in the prompt and do not mix up track characteristics. Do not say hello, do not introduce the topic, and do not compliment choices. Start immediately with direct, actionable tuning advice using bullet points. 

You must strictly adhere to the following verified GT7 garage configuration boundaries when recommending setting adjustments:
- Brake Balance Controller Scale: Range is -5 to 5. Negative values (-1 to -5) represent FRONT bias. Positive values (1 to 5) represent REAR bias. 0 is absolute Neutral. Never invert this logic.
- Anti-Roll Bars (ARB): Scale is 1 to 10 for both Front and Rear.
- Toe Angle: Scale is -1.00 to 1.00. Negative values indicate Toe-Out (direction outward), positive values indicate Toe-In (direction inward).
- LSD Initial Torque: Scale is 5 to 60.
- LSD Acceleration Sensitivity: Scale is 5 to 60.
- LSD Braking Sensitivity: Scale is 5 to 60.

You must provide specific numerical values, slider clicks, or concrete mechanical adjustments based on these exact limits for the car, tires, and track conditions requested. Keep explanations to one clear sentence per point.`;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-lite', 
                contents: apiContents,
                config: {
                    systemInstruction: systemInstruction,
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

            // Route response back to driver
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
            console.error("AI Error Details:", error);
            await message.reply("Engineering error. The telemetry link dropped.");
        }
    }
});

client.login(DISCORD_TOKEN);
