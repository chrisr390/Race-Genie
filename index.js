const { 
    Client, GatewayIntentBits, Partials, ActivityType, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const http = require('http');
const { DISCORD_TOKEN, PORT } = require('./config');
const { generateSetupAdvice } = require('./services/gemini');
const { getSession, updateSessionHistory, clearSession, logUserFeedback } = require('./services/session');
const { searchTracks, searchCars } = require('./services/autocomplete');

// 🚀 FORCE DISCORD TO REGISTER THE NEW UNIFIED LAYOUT ON BOOT
require('./deploy-commands');

// 🔧 Hardcoded Production Admin Log Channel ID
const ADMIN_LOG_CHANNEL_ID = '1522549619538526258';

// 🔒 Hardcoded Premium Loyalty Role ID
const LOYALTY_ROLE_ID = '1517792455783874650';

// Simple web server for Render health checks and keep-awake feedback loop
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Race Genie running!\n');
}).listen(PORT, () => {
    console.log(`Health check server listening on port ${PORT}`);
    
    const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
    if (RENDER_EXTERNAL_URL) {
        setInterval(() => {
            http.get(RENDER_EXTERNAL_URL, (res) => {
                console.log(`[Keep-Awake] Self-ping status: ${res.statusCode}`);
            }).on('error', (err) => {
                console.error('[Keep-Awake] Ping failed:', err.message);
            });
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

async function logToAdminChannel(logMessage) {
    try {
        const channel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID);
        if (channel && channel.isTextBased()) await channel.send({ content: logMessage });
    } catch (err) { console.error("Log error:", err); }
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

    if (interaction.isButton()) {
        const [action, ratingValue] = interaction.customId.split('_');
        if (action === 'rate') {
            const modal = new ModalBuilder().setCustomId(`feedbackModal_${ratingValue}`).setTitle('Race Engineering Review');
            const feedbackInput = new TextInputBuilder()
                .setCustomId('feedbackNotes')
                .setLabel("How did the setup handle?")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("E.g., Snapped on curbs, great traction...")
                .setRequired(false)
                .setMaxLength(500);
            modal.addComponents(new ActionRowBuilder().addComponents(feedbackInput));
            await interaction.showModal(modal);
        }
        return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('feedbackModal_')) {
        const ratingType = interaction.customId.split('_')[1];
        const userNotes = interaction.fields.getTextInputValue('feedbackNotes') || 'No comment.';
        const session = getSession(interaction.user.id);
        if (typeof logUserFeedback === 'function') logUserFeedback(interaction.user.id, interaction.user.tag, session.activeCar || 'Unknown', ratingType, userNotes);
        
        await logToAdminChannel(`📊 **Feedback:** ${interaction.user.tag} | ${ratingType === 'up' ? '👍' : '👎'} | ${userNotes}`);
        await interaction.reply({ content: "🏁 **Feedback received.** Thank you!", ephemeral: true });
        try { await interaction.message.edit({ components: [] }); } catch (e) {}
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, user, member } = interaction;

    if (commandName === 'car-setup') {
        await interaction.deferReply({ ephemeral: true });
        const car = interaction.options.getString('car');
        const session = getSession(user.id);
        session.activeCar = car; 

        let userPrompt = `Request:\n- Car: ${car}\n- Track: ${interaction.options.getString('track')}\n- Tyres: ${interaction.options.getString('tyres')}\n- Downforce: ${interaction.options.getString('downforce') || 'N/A'}`;
        
        try {
            const advice = await generateSetupAdvice(userPrompt, session.history, interaction.options.getAttachment('screenshot'));
            updateSessionHistory(user.id, userPrompt, advice);
            const chunks = splitMessage(`🏁 **SETUP SHEET:**\n\n${advice}`);
            
            for (let i = 0; i < chunks.length; i++) {
                if (i === chunks.length - 1) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('rate_up').setLabel('Good Setup 👍').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('rate_down').setLabel('Needs Adjustments 👎').setStyle(ButtonStyle.Danger)
                    );
                    await user.send({ content: chunks[i], components: [row] });
                } else await user.send({ content: chunks[i] });
            }
            await interaction.editReply({ content: "🏁 *Check your DMs for the setup sheet.*" });
        } catch (e) {
            await interaction.editReply({ content: "⚠️ *Engineering link dropped. Please try again.*" });
        }
    }
});

client.login(DISCORD_TOKEN);
