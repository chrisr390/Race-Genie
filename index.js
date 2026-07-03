const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const http = require('http');
const { DISCORD_TOKEN, PORT } = require('./config');
const { generateSetupAdvice } = require('./services/gemini');
const { getSession, updateSessionHistory, clearSession } = require('./services/session');
const { searchTracks, searchCars } = require('./services/autocomplete');

// 🔧 Hardcoded Production Admin Log Channel ID
const ADMIN_LOG_CHANNEL_ID = '1522549619538526258';

// 🔒 Hardcoded Premium Loyalty Role ID
const LOYALTY_ROLE_ID = '1517792455783874650';

// Simple web server for Render health checks
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Race Genie running!\n');
}).listen(PORT, () => {
    console.log(`Health check server listening on port ${PORT}`);
});

/**
 * Splits a text into chunks of at most maxLength characters, split cleanly at newlines.
 */
function splitMessage(text, maxLength = 2000) {
    if (text.length <= maxLength) return [text];
    const chunks = [];
    let currentChunk = '';
    const lines = text.split('\n');
    for (const line of lines) {
        if (line.length > maxLength) {
            let remainingLine = line;
            while (remainingLine.length > 0) {
                const sliceLength = maxLength - currentChunk.length;
                currentChunk += remainingLine.slice(0, sliceLength);
                chunks.push(currentChunk);
                currentChunk = '';
                remainingLine = remainingLine.slice(sliceLength);
            }
        } else if ((currentChunk + line + '\n').length > maxLength) {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = line + '\n';
        } else {
            currentChunk += line + '\n';
        }
    }
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}

/**
 * Helper function to send formatted logs to the designated private admin channel
 */
async function logToAdminChannel(logMessage) {
    try {
        const channel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID);
        if (channel && channel.isTextBased()) {
            await channel.send({ content: logMessage });
        }
    } catch (err) {
        console.error("Failed to send log to admin channel:", err);
    }
}

// Initialize Discord Client with accurate Gateway Intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('GT7 Telemetry', { type: ActivityType.Watching });
});

// --- HANDLE INTERACTIONS (SLASH COMMANDS & AUTOCOMPLETE) ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isAutocomplete()) {
        const { commandName } = interaction;
        if (commandName === 'car-setup') {
            const focusedOption = interaction.options.getFocused(true);
            let choices = [];
            if (focusedOption.name === 'car') {
                choices = searchCars(focusedOption.value);
            } else if (focusedOption.name === 'track') {
                choices = searchTracks(focusedOption.value);
            }
            try {
                await interaction.respond(choices.map(choice => ({ name: choice, value: choice })));
            } catch (err) {
                console.error("Autocomplete Response Error:", err);
            }
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, user, member } = interaction;

    // 🔒 ROLE SECURITY CHECK: Verify user has the required loyalty benefit role
    if (commandName === 'car-setup' || commandName === 'reset') {
        if (!member || !member.roles.cache.has(LOYALTY_ROLE_ID)) {
            await logToAdminChannel(`🛡️ **Access Denied (Missing Role)**\n👤 **User:** ${user.tag} (${user.id})\n⚠️ Attempted to use \`/${commandName}\` without the loyalty benefit role.`);
            return interaction.reply({
                content: "🔒 **Access Restricted:** Race Genie is a premium loyalty benefit reserved for specific server members. If you think this is a mistake, please reach out to an admin!",
                ephemeral: true
            });
        }
    }

    if (commandName === 'car-setup') {
        const car = interaction.options.getString('car');
        const track = interaction.options.getString('track');
        const weather = interaction.options.getString('weather') || 'Standard Dry';
        const drivetrain = interaction.options.getString('drivetrain');
        const frontDownforce = interaction.options.getString('front_downforce');
        const rearDownforce = interaction.options.getString('rear_downforce');
        const regulations = interaction.options.getString('regulations');
        const screenshot = interaction.options.getAttachment('screenshot');

        await interaction.deferReply({ ephemeral: true });
        const session = getSession(user.id);

        let userPrompt = `Request details:\n- Car: ${car}\n- Track: ${track}\n- Weather/Conditions: ${weather}`;
        if (drivetrain) userPrompt += `\n- Drivetrain Layout: ${drivetrain}`;
        if (frontDownforce) userPrompt += `\n- Front Downforce: ${frontDownforce}`;
        if (rearDownforce) userPrompt += `\n- Rear Downforce: ${rearDownforce}`;
        if (regulations) userPrompt += `\n- Regulations: ${regulations}`;
        if (screenshot) userPrompt += `\n- Screenshot attached.`;

        // Telemetry Logging: Initial session spin-up (Sanitized: Content removed)
        await logToAdminChannel(`⚙️ **New Engineering Session Started**\n👤 **Driver:** ${user.tag} (${user.id})\n📋 *Baseline request submitted successfully.*`);

        try {
            const advice = await generateSetupAdvice(userPrompt, session.history, screenshot);
            updateSessionHistory(user.id, userPrompt, advice);

            const responseText = `🏁 **YOUR PRIVATE SETUP SHEET:**\n\n${advice}`;
            const chunks = splitMessage(responseText);

            for (const chunk of chunks) {
                await user.send({ content: chunk });
            }

            await interaction.editReply({
                content: "🏁 *Analysis complete! Your custom setup sheet has been sent directly to your DMs.*"
            });

            // Telemetry Logging: Successful delivery
            await logToAdminChannel(`✅ **Setup Sheet Delivered**\n👤 **Driver:** ${user.tag}\n📋 *Baseline sheet generated and successfully DMed.*`);

        } catch (error) {
            console.error("Interaction Setup Error:", error);
            if (error.code === 50007) {
                await interaction.editReply({
                    content: "⚠️ *I tried to DM you your setup, but your privacy settings are blocking direct messages. Please enable DMs and try again!*"
                });
                await logToAdminChannel(`❌ **Delivery Failed (DMs Blocked)**\n👤 **Driver:** ${user.tag}\n⚠️ *User has direct messages disabled.*`);
            } else {
                await interaction.editReply({
                    content: "⚠️ *Engineering telemetry link dropped. Please try again in a moment.*"
                });
                await logToAdminChannel(`💥 **Engine Error**\n👤 **Driver:** ${user.tag}\n⚠️ *Internal error occurred during execution.*`);
            }
        }
    }

    if (commandName === 'reset') {
        const deleted = clearSession(user.id);
        const logMsg = deleted 
            ? `🧹 **Manual Reset:** ${user.tag} cleared their active session cache.` 
            : `🧹 **Manual Reset:** ${user.tag} attempted a reset but had no active cache.`;
        await logToAdminChannel(logMsg);

        if (deleted) {
            await interaction.reply({ content: "🏁 *Race memory cleared. Setup cache is back to baseline.*", ephemeral: true });
        } else {
            await interaction.reply({ content: "🏁 *You don't have any active setup session memory to clear.*", ephemeral: true });
        }
    }
});

// --- HANDLE NATURAL DM CHAT ---
client.on('messageCreate', async (message) => {
    if (message.channel.type !== 1 || message.author.bot) return;

    const user = message.author;
    const session = getSession(user.id);

    // DM context relies on a valid server-side session, which already checked the role at initialization
    if (!session.history || session.history.length === 0) {
        return message.channel.send({
            content: "🏁 *Your active engineering session has expired or has not been initialized yet. Please return to the server channel and use the `/car-setup` command to start a new tuning profile!*"
        });
    }
    
    await message.channel.sendTyping();
    const userPrompt = message.content;

    // Telemetry Logging: DM follow-up intercept (Sanitized: Content removed)
    await logToAdminChannel(`💬 **DM Follow-up Received**\n👤 **Driver:** ${user.tag}\n📝 *Processing tuning adjustments...*`);

    try {
        const reply = await generateSetupAdvice(userPrompt, session.history, null);
        updateSessionHistory(user.id, userPrompt, reply);

        const chunks = splitMessage(reply);
        for (const chunk of chunks) {
            await message.channel.send({ content: chunk });
        }
    } catch (error) {
        console.error("DM Chat Error:", error);
        await message.channel.send({
            content: "⚠️ *Engineering link dropped. Let's try that adjustment again in a moment.*"
        });
        await logToAdminChannel(`💥 **DM Adjustment Error:** Failed to process follow-up response for ${user.tag}.`);
    }
});

client.login(DISCORD_TOKEN);
