const { Client, GatewayIntentBits, ActivityType, ChannelType, Partials } = require('discord.js');
const http = require('http');
const axios = require('axios'); // Required to download images from Discord

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
const TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes memory limit

// Helper function to turn a Discord attachment URL into Gemini's image data format
async function urlToGenerativePart(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'];
        return {
            inlineData: {
                data: Buffer.from(response.data).toString("base64"),
                mimeType: contentType
            },
        };
    } catch (error) {
        console.error("Error downloading attachment:", error);
        return null;
    }
}

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

        // Check if there is an image attached
        const hasAttachment = message.attachments.size > 0;

        // If no text and no image, reject
        if (!prompt && !hasAttachment) {
            message.reply("Race Genie is online. Drop a tuning screenshot or ask a setup question!");
            return;
        }

        await message.channel.sendTyping();

        const userId = message.author.id;
        const now = Date.now();

        // Manage session tracking
        if (!conversations.has(userId) || (now - conversations.get(userId).lastActive > TIMEOUT_MS)) {
            conversations.set(userId, { history: [], lastActive: now });
        }

        const session = conversations.get(userId);
        session.lastActive = now;

        // Build the historical API contents payload
        const apiContents = [];
        for (const msg of session.history) {
            apiContents.push({
                role: msg.role,
                parts: [{ text: msg.text }]
            });
        }
        
        // Prepare current payload block
        const currentParts = [];
        
        // Process attachment if present
        if (hasAttachment) {
            const attachment = message.attachments.first();
            // Verify it is an image file type
            if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                const imageData = await urlToGenerativePart(attachment.url);
                if (imageData) {
                    currentParts.push(imageData);
                }
            }
        }
        
        // Add the text prompt if they sent text alongside/without the image
        if (prompt) {
            currentParts.push({ text: prompt });
        } else if (hasAttachment) {
            // Fallback prompt if they only drop a photo with zero text
            currentParts.push({ text: "Analyze this car settings sheet and give me track tuning recommendations." });
        }

        apiContents.push({
            role: 'user',
            parts: currentParts
        });

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: apiContents,
                config: {
                    systemInstruction: "You are Race Genie, a no-nonsense trackside race engineer. You have advanced computer vision capabilities to accurately read text, sliders, bars, and values directly from uploaded racing UI screenshots. Do not say hello, do not introduce the topic, and do not compliment choices. Start immediately with direct, actionable tuning advice using bullet points. You must provide specific numerical ranges, slider directions, or concrete mechanical adjustments for the exact car, tires, and track conditions requested. Keep explanations to one clear sentence per point.",
                    maxOutputTokens: 1850
                }
            });

            const engineerResponse = response.text;

            // Commit plain text representations to the history timeline
            const historyText = prompt || "[Uploaded Image Analysis]";
            session.history.push({ role: 'user', text: historyText });
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

