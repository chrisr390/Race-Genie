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
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages // <-- Add this line right here
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Check if the message is a direct private DM OR a public server mention
    const isDM = message.channel.type === 1; // 1 represents a DM channel in discord.js v14
    const isMentioned = message.mentions.has(client.user) && !message.mentions.everyone;

    if (isDM || isMentioned) {
        // Clean up the prompt by removing the bot mention tag if it exists
        const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();

        if (!prompt) {
            message.reply("Race Genie is online. What's the setup issue?");
            return;
        }

        await message.channel.sendTyping();

        try {
            // Call Gemini API once
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [prompt],
                config: {
                    systemInstruction: "You are Race Genie, a no-nonsense trackside race engineer. Do not say hello, do not introduce the topic, and do not compliment choices. Start immediately with direct, actionable tuning advice using bullet points. You must provide specific numerical ranges, slider directions, or concrete mechanical adjustments for the exact car, tires, and track conditions requested. Keep explanations to one clear sentence per point.",
                    maxOutputTokens: 1850
                }
            });

            const engineerResponse = response.text;

            // If the user messaged us in a public server, send it to DM and leave a note
            if (!isDM) {
                try {
                    await message.author.send(engineerResponse);
                    await message.reply("🏁 *Check your DMs, driver! I've sent the setup sheets over.*");
                } catch (dmError) {
                    console.error("Could not send DM to user:", dmError);
                    await message.reply("⚠️ *I tried to DM you the setup, but your privacy settings blocked me! Here it is instead:*\n\n" + engineerResponse);
                }
            } else {
                // If they are already chatting in DMs, just reply directly in the DM!
                await message.reply(engineerResponse);
            }

        } catch (error) {
            console.error("AI Error:", error);
            await message.reply("Engineering error. The telemetry link dropped.");
        }
    }
});
