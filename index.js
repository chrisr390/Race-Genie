import { Client, GatewayIntentBits } from 'discord.js';
import { GoogleGenAI } from '@google/genai';

// 1. Initialize Discord Client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 2. Initialize Gemini API Client
// Note: GoogleGenAI automatically looks for process.env.GEMINI_API_KEY
const ai = new GoogleGenAI();

client.once('ready', () => {
    console.log(`🚀 Logged in as ${client.user.tag}! Race Genie is online.`);
});

client.on('messageCreate', async (message) => {
    // Ignore messages from bots to prevent infinite loops
    if (message.author.bot) return;

    // Check if the bot was mentioned
    if (message.mentions.has(client.user)) {
        // Show typing indicator so users know the bot is thinking
        await message.channel.sendTyping();

        // Clean up the prompt text by removing the bot mention badge
        const cleanPrompt = message.content.replace(/<@!?\d+>/g, '').trim();

        // Handle a blank mention
        if (!cleanPrompt) {
            return message.reply("🏁 Cooee! Send me some car details or a tuning question and I'll jump right on it.");
        }

        try {
            // Call Gemini using the high-quota free track model
            const response = await ai.models.generateContent({
                model: 'gemini-1.5-flash',
                contents: cleanPrompt,
                // Add safe configuration handling to prevent tuning blocks
                config: {
                    safetySettings: [
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                    ]
                }
            });

            // Verify a valid text response came back
            if (response && response.text) {
                // Discord has a 2000 character limit per message; trim or split if needed
                const replyText = response.text.length > 2000 ? response.text.substring(0, 1990) + "..." : response.text;
                await message.reply(replyText);
            } else {
                await message.reply("⚠️ The AI engine processed that, but returned an empty blueprint. Try tweaking your text.");
            }

        } catch (error) {
            console.error("❌ Gemini API Error Details:", error);
            
            // Helpful errors on the Discord front end for debugging
            if (error.toString().includes("429") || error.toString().includes("quota")) {
                await message.reply("🛑 API Pit Lane Closed: Google's daily quota limit is full. Try again shortly!");
            } else {
                await message.reply("⚙️ Snag in the gearbox! I couldn't process those car details. Let's try a simpler format.");
            }
        }
    }
});

// Log into Discord using your environment variable token
client.login(process.env.DISCORD_TOKEN);
