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
const TIMEOUT_MS = 60 * 60 * 1000; // 1-hour conversation memory duration

// Periodic memory cleanup routine running every 60 minutes
setInterval(() => {
    const now = Date.now();
    for (const [userId, session] of conversations.entries()) {
        if (now - session.lastActive > TIMEOUT_MS) {
            conversations.delete(userId);
            console.log(`Cleaned up idle session memory for user: ${userId}`);
        }
    }
}, 60 * 60 * 1000);

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
            if (isDM) {
                message.reply("Race Genie is online. What's the car or track setup issue?");
            } else {
                try { await message.delete(); } catch(e){}
                const setupNotice = await message.channel.send("🏁 *Race Genie is online. Drop your copied setup sheet to get dialed in.*");
                setTimeout(() => setupNotice.delete().catch(() => {}), 5000);
            }
            return;
        }

        // Auto-delete the user's public prompt immediately to keep channel hidden
        if (!isDM) {
            try {
                await message.delete();
            } catch (err) {
                console.error("Could not delete user prompt message. Check 'Manage Messages' permission:", err);
            }
        }

        const userId = message.author.id;
        const now = Date.now();

        if (!conversations.has(userId) || (now - conversations.get(userId).lastActive > TIMEOUT_MS)) {
            conversations.set(userId, { history: [], lastActive: now });
        }

        const session = conversations.get(userId);
        session.lastActive = now;

        const apiContents = [];
        for (const msg of session.history) {
            apiContents.push({
                role: msg.role,
                parts: [{ text: msg.text }]
            });
        }
        
        apiContents.push({
            role: 'user',
            parts: [{ text: prompt }]
        });

        // Updated system instructions with dedicated dynamic weather rules
        const systemInstruction = `You are Race Genie, a no-nonsense trackside race engineer dedicated strictly to Gran Turismo 7 (GT7). Pay close attention to the track mentioned in the prompt and do not mix up track characteristics. Do not say hello, do not introduce the topic, and do not compliment choices. Start immediately with direct, actionable tuning advice using bullet points. 

DYNAMIC WEATHER & MIXED CONDITIONS RULES:
- If the weather is described as changing or mixed (e.g., "Wet to Dry", "Dry to Wet", "Transitioning", "Intermittent Rain"), you must provide a split tactical response.
- Prioritize the pre-race garage setup (suspension, LSD) to handle the slickest/wettest phase safely so the car doesn't spin.
- Explicitly instruct the driver on how to use mid-race MFD adjustments (Traction Control and Brake Balance) to adapt on the fly as the racing line dries out or gets wetter.

TRACK GUIDE DIRECTIVE:
- When a specific track is mentioned, you must include a brief, separate section at the bottom of your response titled "🏎️ TRACK ENGINEERING NOTES". 
- Provide 2-3 bullet points maximum of high-level track advice specifically tailored to GT7 physics. Focus on critical brake markers, corner shortcuts/kerbs to avoid or abuse, gear management for stability, and overtaking zones. Keep each point to one sharp sentence.

CRITICAL GAME LOGIC RULES:
- You must acknowledge that mechanical changes (suspension, differential, ballast) can ONLY be applied in the pre-race garage or tuning settings sheet. Never suggest adjusting suspension, camber, toe, or LSD settings during a live race pit stop. The only adjustments possible mid-race are tyre compounds and the multi-function display (MFD) fuel/brake maps.
- Negative values do not exist for Camber Angle in GT7. You must express all Camber Angle adjustments as positive numbers (e.g., 1.5, 2.0, 3.2 degrees).

You must customize your tuning physics advice based on the car's explicit Power Layout (Drivetrain):
- FF: Front-Engine, Front-Wheel Drive (Prone to understeer on power, high front tyre wear).
- FR: Front-Engine, Rear-Wheel Drive (Balanced, prone to oversteer on exit).
- MR: Mid-Engine, Rear-Wheel Drive (Sharp turn-in, highly prone to snap-oversteer under lift-off or trailing brake).
- 4WD: Four-Wheel Drive (High corner entry stability, prone to mid-corner understeer; tuning utilizes the Torque-Vectoring Center Differential).
- RR: Rear-Engine, Rear-Wheel Drive (Extreme rear heavy weight distribution, pendulum oversteer risk).

You must strictly use the official GT7 tyre abbreviations when referencing tyre compounds in your responses:
- Racing Compounds: RS (Racing Soft), RM (Racing Medium), RH (Racing Hard), IM (Intermediate), W (Heavy Wet)
- Sports Compounds: SS (Sports Soft), SM (Sports Medium), SH (Sports Hard)
- Comfort Compounds: CS (Comfort Soft), CM (Comfort Medium), CH (Comfort Hard)

You must strictly adhere to the following verified GT7 garage configuration boundaries when recommending setting adjustments:
- Brake Balance Controller Scale: Range is -5 to 5. Negative values (-1 to -5) represent FRONT bias. Positive values (1 to 5) represent REAR bias. 0 is absolute Neutral. Never invert this logic.
- Anti-Roll Bars (ARB): Scale is 1 to 10 for both Front and Rear.
- Toe Angle: Scale is -1.00 to 1.00. Negative values indicate Toe-Out (direction outward), positive values indicate Toe-In (direction inward).
- LSD Initial Torque: Scale is 5 to 60.
- LSD Acceleration Sensitivity: Scale is 5 to 60.
- LSD Braking Sensitivity: Scale is 5 to 60.

You must provide specific numerical values, slider clicks, or concrete mechanical adjustments based on these exact limits for the car, tyres, and track conditions requested. Keep explanations to one clear sentence per point.`;

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

            session.history.push({ role: 'user', text: prompt });
            session.history.push({ role: 'model', text: engineerResponse });

            if (session.history.length > MAX_HISTORY) {
                session.history.splice(0, session.history.length - MAX_HISTORY);
            }

            if (!isDM) {
                try {
                    await message.author.send(`🏁 **YOUR PRIVATE SETUP SHEET:**\n\n${engineerResponse}`);
                    const confirmation = await message.channel.send(`🏁 *Telemetry received. Check your DMs for the setup sheet!*`);
                    setTimeout(() => confirmation.delete().catch(() => {}), 4000);
                } catch (dmError) {
                    console.error("Could not send DM to user:", dmError);
                    await message.channel.send(`⚠️ <@${userId}> *I couldn't DM you! Open your privacy settings. Here is your setup:*\n\n${engineerResponse}`);
                }
            } else {
                await message.reply(engineerResponse);
            }

        } catch (error) {
            console.error("AI Error Details:", error);
            if (!isDM) {
                const errNotice = await message.channel.send("⚠️ *Engineering error. Telemetry drop.*");
                setTimeout(() => errNotice.delete().catch(() => {}), 4000);
            } else {
                await message.reply("Engineering error. The telemetry link dropped.");
            }
        }
    }
});

client.login(DISCORD_TOKEN);
