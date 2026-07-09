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

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Race Genie running!\n');
}).listen(PORT, () => {
    console.log(`Health check server listening on port ${PORT}`);
    
    const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
    if (RENDER_EXTERNAL_URL) {
        setInterval(() => {
            http.get(RENDER_EXTERNAL_URL, (res) => {}).on('error', (err) => {});
        }, 600000);
    }
});

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
            if (currentChunk.trim()) chunks.push(currentChunk.trim());
            currentChunk = line + '\n';
        } else {
            currentChunk += line + '\n';
        }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks;
}

// --- RESTORED ADMIN LOGGING HELPER ---
async function logToAdminChannel(logMessage) {
    try {
        const channel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID);
        if (channel && channel.isTextBased()) {
            await channel.send({ content: logMessage });
        }
    } catch (err) {
        console.error("Admin log error:", err);
    }
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('GT7 Telemetry', { type: ActivityType.Watching });
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isAutocomplete()) {
        const { commandName } = interaction;
        if (commandName === 'car-setup') {
            const focusedOption = interaction.options.getFocused(true);
            let choices = [];
            if (focusedOption.name === 'car') choices = searchCars(focusedOption.value);
            else if (focusedOption.name === 'track') choices = searchTracks(focusedOption.value);
            try { await interaction.respond(choices.map(choice => ({ name: choice, value: choice }))); } catch (err) {}
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, user, member } = interaction;

    if (commandName === 'car-setup') {
        if (!member || !member.roles.cache.has(LOYALTY_ROLE_ID)) {
            return interaction.reply({
                content: "🔒 **Access Restricted:** Race Genie is a premium loyalty benefit reserved for specific server members.",
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });
        const car = interaction.options.getString('car');
        const track = interaction.options.getString('track');
        const tyres = interaction.options.getString('tyres');
        const weather = interaction.options.getString('weather') || 'Standard Dry';
        const drivetrain = interaction.options.getString('drivetrain');
        const downforce = interaction.options.getString('downforce');
        const regulations = interaction.options.getString('regulations');
        const screenshot = interaction.options.getAttachment('screenshot');

        const session = getSession(user.id);
        session.activeCar = car; 

        let userPrompt = `Request details:\n- Car: ${car}\n- Track: ${track}\n- Tyres: ${tyres}\n- Weather/Conditions: ${weather}`;
        if (drivetrain) userPrompt += `\n- Drivetrain Layout: ${drivetrain}`;
        if (downforce) userPrompt += `\n- Downforce Levels: ${downforce}`;
        if (regulations) userPrompt += `\n- Regulations: ${regulations}`;
        if (screenshot) userPrompt += `\n- Screenshot attached.`;
        
        try {
            const advice = await generateSetupAdvice(userPrompt, session.history, screenshot);
            updateSessionHistory(user.id, userPrompt, advice);
            const chunks = splitMessage(`🏁 **SETUP SHEET:**\n\n${advice}`);
            
            for (const chunk of chunks) {
                await user.send({ content: chunk });
            }
            await interaction.editReply({ content: "🏁 *Check your DMs for the setup sheet.*" });
            
            // --- ADDED ADMIN LOG TRIGGER ---
            await logToAdminChannel(`📋 **Setup Generated:** ${user.tag} | Car: ${car} | Track: ${track} | Tyres: ${tyres}`);
        } catch (e) {
            console.error("Setup generation error:", e);
            await interaction.editReply({ content: "⚠️ *Engineering link dropped. Please try again.*" });
        }
    }

    if (commandName === 'reset') {
        const deleted = clearSession(user.id);
        await interaction.reply({ 
            content: deleted ? "🏁 *Race memory cleared.*" : "🏁 *No active session memory to clear.*", 
            ephemeral: true 
        });
    }
});

client.on('messageCreate', async (message) => {
    if (message.channel.type !== 1 || message.author.bot) return;

    const user = message.author;
    const session = getSession(user.id);

    if (!session.history || session.history.length === 0) {
        return message.channel.send({
            content: "🏁 *Your active engineering session has expired. Use `/car-setup` on the server to start a new profile!*"
        });
    }
    
    await message.channel.sendTyping();
    const userPrompt = message.content;

    try {
        const reply = await generateSetupAdvice(userPrompt, session.history, null);
        updateSessionHistory(user.id, userPrompt, reply);

        const chunks = splitMessage(reply);
        for (const chunk of chunks) {
            await message.channel.send({ content: chunk });
        }
    } catch (error) {
        console.error("DM Chat Error:", error);
        await message.channel.send({ content: "⚠️ *Engineering link dropped. Try again.*" });
    }
});

client.login(DISCORD_TOKEN);
